import { lambdaLogger } from '../../../packages/logger/src';
import { getUserIdFromEvent } from '../../lib/src/auth';
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
		
		// Get dashboard URL for default redirects
		const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
		
		// Default redirect URLs based on payment type
		const defaultRedirectUrl = type === 'wallet_topup' 
			? `${dashboardUrl}/wallet?payment=success`
			: galleryId 
				? `${dashboardUrl}/galleries?payment=success&gallery=${galleryId}`
				: `${dashboardUrl}/galleries?payment=success`;
		
		const finalRedirectUrl = redirectUrl || defaultRedirectUrl;
		
		const successUrl = apiUrl 
			? `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`
			: 'https://your-frontend/payments/success?session_id={CHECKOUT_SESSION_ID}';
		const cancelUrl = apiUrl
			? `${apiUrl}/payments/cancel`
			: 'https://your-frontend/payments/cancel';

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
								? `Top up your PhotoHub wallet` 
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
				redirectUrl: finalRedirectUrl // Store redirect URL in metadata
			},
			client_reference_id: `${requester}-${Date.now()}`
		});

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				checkoutUrl: session.url,
				sessionId: session.id
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
