import { lambdaLogger } from '../../../packages/logger/src';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { createTransaction, updateTransactionStatus } from '../../lib/src/transactions';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const stripeWebhookSecret = envProc?.env?.STRIPE_WEBHOOK_SECRET as string;
	const apiUrl = envProc?.env?.PUBLIC_API_URL as string || '';
	
	if (!stripeSecretKey) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Stripe not configured' })
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
		const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
		
		// ALWAYS use redirectUrl from request if provided (this is the primary method)
		// Fallback to default only if redirectUrl is not provided
		let finalRedirectUrl = redirectUrl;
		if (!finalRedirectUrl) {
			// Log warning if redirectUrl is missing - this should not happen in normal flow
			console.warn('redirectUrl not provided in request, using default', { type, galleryId });
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
					console.error('Failed to create wallet top-up transaction', {
						error: txnErr.message,
						userId: requester,
						amountCents
					});
					// Continue with Stripe session creation even if transaction creation fails
				}
			}
		}
		
		const successUrl = apiUrl 
			? `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`
			: 'https://your-frontend/payments/success?session_id={CHECKOUT_SESSION_ID}';
		const cancelUrl = apiUrl
			? `${apiUrl}/payments/cancel?session_id={CHECKOUT_SESSION_ID}${transactionId ? `&transactionId=${transactionId}&userId=${requester}` : ''}`
			: `https://your-frontend/payments/cancel?session_id={CHECKOUT_SESSION_ID}${transactionId ? `&transactionId=${transactionId}&userId=${requester}` : ''}`;

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			mode: 'payment',
			line_items: [
				{
					price_data: {
						currency: 'pln',
						product_data: {
							name: type === 'wallet_topup' ? 'Wallet Top-up' : `Gallery Payment`,
							description: type === 'wallet_topup' 
								? `Top up your PhotoCloud wallet` 
								: `Payment for gallery ${galleryId}`
						},
						unit_amount: amountCents
					},
					quantity: 1
				}
			],
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: {
				userId: requester,
				type,
				galleryId: galleryId,
				transactionId: transactionId || '',
				redirectUrl: finalRedirectUrl // Store redirect URL in metadata
			},
			client_reference_id: `${requester}-${Date.now()}`
		});

		// Update transaction with Stripe session ID if transaction was created
		if (transactionId && type === 'wallet_topup') {
			try {
				await updateTransactionStatus(requester, transactionId, 'UNPAID', {
					stripeSessionId: session.id
				});
			} catch (updateErr: any) {
				console.error('Failed to update transaction with Stripe session ID', {
					error: updateErr.message,
					transactionId
				});
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
		console.error('Stripe checkout creation failed:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Checkout creation failed', message: error.message })
	};
	}
});
