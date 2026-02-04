import { lambdaLogger } from '../../../packages/logger/src';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { createTransaction, updateTransactionStatus } from '../../lib/src/transactions';
import { getStripeSecretKey, createStripeCheckoutSession } from '../../lib/src/stripe-config';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	
	let stripeSecretKey: string;
	try {
		stripeSecretKey = await getStripeSecretKey();
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Stripe not configured', message: error.message })
		};
	}
	
	if (!stripeSecretKey) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Stripe not configured' })
		};
	}
	
	let apiUrl: string;
	try {
		apiUrl = await getRequiredConfigValue(stage, 'PublicApiUrl', { envVarName: 'PUBLIC_API_URL' });
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing configuration', message: error.message })
		};
	}

	const requester = getUserIdFromEvent(event);
	if (!requester) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	const body = event?.body ? JSON.parse(event.body) : {};
	const amountCents = body?.amountCents;
	const type = body?.type || 'wallet_topup'; // 'wallet_topup' or 'gallery_payment'
	const redirectUrl = body?.redirectUrl; // Optional redirect URL after payment

	if (!amountCents || amountCents < 100) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Invalid amount (minimum 100 cents)' })
		};
	}

	try {
		const stripe = new Stripe(stripeSecretKey);
		const galleryId = body?.galleryId || '';
		
		// Get dashboard URL for fallback redirects (only used if redirectUrl is not provided)
		const dashboardUrl = await getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' });
		
		// ALWAYS use redirectUrl from request if provided (this is the primary method)
		// Fallback to default only if redirectUrl is not provided
		let finalRedirectUrl = redirectUrl;
		if (!finalRedirectUrl) {
			// Log warning if redirectUrl is missing - this should not happen in normal flow
			logger?.warn('redirectUrl not provided in request, using default', { type, galleryId });
			finalRedirectUrl = type === 'wallet_topup' 
				? `${dashboardUrl}/wallet?payment=success`
				: galleryId 
					? `${dashboardUrl}/galleries?payment=success&gallery=${galleryId}`
					: `${dashboardUrl}/galleries?payment=success`;
		}
		
		// Create transaction for wallet top-up BEFORE creating Stripe session
		let transactionId: string | undefined;
		if (type === 'wallet_topup') {
			const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
			if (transactionsTable) {
				try {
					// Build composites list for frontend display
					const composites: string[] = ['Wallet Top-up'];
					
					transactionId = await createTransaction(
						requester,
						'WALLET_TOPUP',
						amountCents,
						{
							walletAmountCents: amountCents,
							stripeAmountCents: 0,
							paymentMethod: 'STRIPE',
							composites,
							metadata: {
								checkoutType: 'wallet_topup'
							}
						}
					);
				} catch (txnErr: any) {
					logger?.error('Failed to create wallet top-up transaction', {
						userId: requester,
						amountCents,
						errorName: txnErr.name,
						errorMessage: txnErr.message
					}, txnErr);
					// Continue with Stripe session creation even if transaction creation fails
				}
			}
		}
		
		const successUrl = `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`;
		const cancelUrl = `${apiUrl}/payments/cancel?session_id={CHECKOUT_SESSION_ID}${transactionId ? `&transactionId=${transactionId}&userId=${requester}` : ''}`;

		const metadata: Record<string, string> = {
			userId: requester,
			type,
			galleryId: galleryId,
			transactionId: transactionId || '',
			redirectUrl: finalRedirectUrl
		};

		const session = await createStripeCheckoutSession(stripe, {
			lineItems: [
				{
					price_data: {
						currency: 'pln',
						product_data: {
							name: type === 'wallet_topup' ? 'Wallet Top-up' : `Gallery Payment`,
							description: type === 'wallet_topup' 
								? `Top up your PixiProof wallet` 
								: `Payment for gallery ${galleryId}`
						},
						unit_amount: amountCents
					},
					quantity: 1
				}
			],
			successUrl,
			cancelUrl,
			metadata,
			clientReferenceId: `${requester}-${Date.now()}`,
			mode: 'payment'
		});

		// Update transaction with Stripe session ID if transaction was created
		if (transactionId && type === 'wallet_topup') {
			try {
				await updateTransactionStatus(requester, transactionId, 'UNPAID', {
					stripeSessionId: session.id
				});
			} catch (updateErr: any) {
				logger?.error('Failed to update transaction with Stripe session ID', {
					transactionId,
					errorName: updateErr.name,
					errorMessage: updateErr.message
				}, updateErr);
			}
		}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				checkoutUrl: session.url,
				sessionId: session.id,
				transactionId: transactionId
			})
		};
	} catch (error: any) {
		logger?.error('Stripe checkout creation failed', {
			userId: requester,
			type,
			galleryId: body?.galleryId,
			amountCents,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Checkout creation failed', message: error.message })
	};
	}
});
