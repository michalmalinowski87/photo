import { lambdaLogger } from '../../../packages/logger/src';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const sessionId = event?.queryStringParameters?.session_id;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	
	// Get dashboard URL from environment - prioritize dashboard-specific env var
	// PUBLIC_GALLERY_URL is for the client gallery frontend, not the dashboard
	const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
	
	// Default redirect URL
	let redirectUrl = `${dashboardUrl}/galleries?payment=success`;
	
	// If we have a session ID and Stripe is configured, fetch the session to get redirect URL from metadata
	if (sessionId && stripeSecretKey) {
		try {
			const stripe = new Stripe(stripeSecretKey);
			const session = await stripe.checkout.sessions.retrieve(sessionId);
			
			// Get redirect URL from metadata if available
			if (session.metadata?.redirectUrl) {
				redirectUrl = session.metadata.redirectUrl;
				logger?.info('Using redirect URL from session metadata', { 
					sessionId, 
					redirectUrl,
					type: session.metadata.type 
				});
			} else {
				// Fallback: determine redirect based on payment type
				const type = session.metadata?.type || 'gallery_payment';
				const galleryId = session.metadata?.galleryId;
				
				if (type === 'wallet_topup') {
					redirectUrl = `${dashboardUrl}/wallet?payment=success`;
				} else if (galleryId) {
					redirectUrl = `${dashboardUrl}/galleries?payment=success&gallery=${galleryId}`;
				}
				
				logger?.info('Using fallback redirect URL', { 
					sessionId, 
					redirectUrl,
					type,
					galleryId 
				});
			}
		} catch (error: any) {
			logger?.error('Failed to retrieve Stripe session', {
				error: {
					name: error.name,
					message: error.message
				},
				sessionId
			});
			// Continue with default redirect URL
		}
	}

	return {
		statusCode: 302,
		headers: {
			Location: redirectUrl
		},
		body: ''
	};
});
