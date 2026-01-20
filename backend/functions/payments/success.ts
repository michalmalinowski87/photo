import { lambdaLogger } from '../../../packages/logger/src';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');
import { generatePaymentPageHTML } from './payment-page-template';
import { getStripeSecretKey } from '../../lib/src/stripe-config';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';

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
	const stage = envProc?.env?.STAGE || 'dev';
	const sessionId = event?.queryStringParameters?.session_id;

	let dashboardUrl: string;
	let apiUrl: string;
	try {
		[dashboardUrl, apiUrl] = await Promise.all([
			getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' }),
			getRequiredConfigValue(stage, 'PublicApiUrl', { envVarName: 'PUBLIC_API_URL' }),
		]);
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: getSecurityHeaders(),
			body: generatePaymentPageHTML({
				title: 'Błąd konfiguracji',
				message: error.message || 'Missing configuration',
				redirectUrl: 'about:blank',
				redirectDelay: 0,
				isSuccess: false,
				sessionId: sessionId || undefined,
			}),
		};
	}
	
	// Default to root dashboard if no valid session
	let redirectUrl = `${dashboardUrl}/`;

	// Get redirectUrl from Stripe session metadata
	if (sessionId) {
		try {
			const stripeSecretKey = await getStripeSecretKey();
			const stripe = new Stripe(stripeSecretKey);
			const session = await stripe.checkout.sessions.retrieve(sessionId);
			if (session.metadata?.redirectUrl) {
				redirectUrl = session.metadata.redirectUrl;
				
				// Add payment=success parameter to redirect URL for wallet top-up and gallery payments
				// This allows the frontend to detect successful payments and reopen wizards if needed
				const url = new URL(redirectUrl);
				if (!url.searchParams.has('payment')) {
					url.searchParams.set('payment', 'success');
					redirectUrl = url.toString();
				}
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
		apiUrl
	});

	return {
		statusCode: 200,
		headers: getSecurityHeaders(),
		body: html
	};
});
