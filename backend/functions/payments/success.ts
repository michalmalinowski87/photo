import { lambdaLogger } from '../../../packages/logger/src';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');
import { generatePaymentPageHTML } from './payment-page-template';

const getSecurityHeaders = () => ({
	'Content-Type': 'text/html; charset=utf-8',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const sessionId = event?.queryStringParameters?.session_id;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
	const apiUrl = envProc?.env?.PUBLIC_API_URL as string || '';
	
	// Default to root dashboard if no valid session
	let redirectUrl = `${dashboardUrl}/`;

	// Get redirectUrl from Stripe session metadata
	if (sessionId && stripeSecretKey) {
		try {
			const stripe = new Stripe(stripeSecretKey);
			const session = await stripe.checkout.sessions.retrieve(sessionId);
			if (session.metadata?.redirectUrl) {
				redirectUrl = session.metadata.redirectUrl;
			}
		} catch (error: any) {
			logger?.error('Failed to retrieve Stripe session', {
				error: error.message,
				sessionId
			});
			// On error, keep default root dashboard redirect
		}
	}

	const html = generatePaymentPageHTML({
		title: 'Twoja płatność została zakończona',
		message: 'Czekamy na zaksięgowanie płatności w naszym systemie. Po zakończeniu przetwarzania zostaniesz automatycznie przekierowany. Może to potrwać do 5 minut.',
		redirectUrl,
		redirectDelay: 2000,
		isSuccess: true,
		sessionId: sessionId || undefined,
		apiUrl: apiUrl || undefined
	});

	return {
		statusCode: 200,
		headers: getSecurityHeaders(),
		body: html
	};
});
