import { getConfigWithEnvFallback } from './ssm-config';

// Cache for Stripe secrets to avoid repeated SSM calls
let stripeSecretKeyCache: string | null = null;
let stripeSecretKeyPromise: Promise<string> | null = null;
let stripeWebhookSecretCache: string | null = null;
let stripeWebhookSecretPromise: Promise<string | undefined> | null = null;

// Cache for payment methods configuration
let stripePaymentMethodsCache: string[] | null = null;
let stripePaymentMethodsPromise: Promise<string[]> | null = null;
let stripePaymentMethodsCacheTimestamp = 0;
const PAYMENT_METHODS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Gets Stripe secret key from SSM Parameter Store with fallback to environment variable
 * Uses caching to avoid repeated SSM calls
 */
export async function getStripeSecretKey(): Promise<string> {
	// Return cached value if available
	if (stripeSecretKeyCache) {
		return stripeSecretKeyCache;
	}

	// Return existing promise if already loading
	if (stripeSecretKeyPromise) {
		return stripeSecretKeyPromise;
	}

	// Load from SSM with env var fallback
	const stage = process.env.STAGE || 'dev';
	stripeSecretKeyPromise = (async () => {
		try {
			const secret = await getConfigWithEnvFallback(stage, 'StripeSecretKey', 'STRIPE_SECRET_KEY');
			
			if (!secret) {
				throw new Error('STRIPE_SECRET_KEY is required (check SSM Parameter Store or STRIPE_SECRET_KEY env var)');
			}
			
			stripeSecretKeyCache = secret;
			return stripeSecretKeyCache;
		} catch (error) {
			// Fallback to env var if SSM fails
			const envSecret = process.env.STRIPE_SECRET_KEY;
			if (envSecret) {
				stripeSecretKeyCache = envSecret;
				return stripeSecretKeyCache;
			}
			throw error;
		}
	})();

	return stripeSecretKeyPromise;
}

/**
 * Gets Stripe webhook secret from SSM Parameter Store with fallback to environment variable
 * Uses caching to avoid repeated SSM calls
 */
export async function getStripeWebhookSecret(): Promise<string | undefined> {
	// Return cached value if available (including undefined)
	if (stripeWebhookSecretCache !== null) {
		return stripeWebhookSecretCache || undefined;
	}

	// Return existing promise if already loading
	if (stripeWebhookSecretPromise) {
		return stripeWebhookSecretPromise;
	}

	// Load from SSM with env var fallback
	const stage = process.env.STAGE || 'dev';
	stripeWebhookSecretPromise = (async () => {
		try {
			const secret = await getConfigWithEnvFallback(stage, 'StripeWebhookSecret', 'STRIPE_WEBHOOK_SECRET');
			
			// Webhook secret is optional (only needed for HTTP webhooks, not EventBridge)
			stripeWebhookSecretCache = secret || '';
			return stripeWebhookSecretCache || undefined;
		} catch (error) {
			// Fallback to env var if SSM fails
			const envSecret = process.env.STRIPE_WEBHOOK_SECRET;
			stripeWebhookSecretCache = envSecret || '';
			return stripeWebhookSecretCache || undefined;
		}
	})();

	return stripeWebhookSecretPromise;
}

/**
 * Gets enabled Stripe payment methods from SSM Parameter Store with fallback to environment variable
 * Uses caching to avoid repeated SSM calls
 * @returns Array of payment method types (e.g., ['card', 'blik', 'apple_pay'])
 */
export async function getStripePaymentMethods(): Promise<string[]> {
	const now = Date.now();
	
	// Return cached value if still valid
	if (stripePaymentMethodsCache !== null && (now - stripePaymentMethodsCacheTimestamp) < PAYMENT_METHODS_CACHE_TTL) {
		return stripePaymentMethodsCache;
	}

	// Return existing promise if already loading
	if (stripePaymentMethodsPromise) {
		return stripePaymentMethodsPromise;
	}

	// Default payment methods (backward compatibility)
	const defaultPaymentMethods = ['card', 'blik', 'p24'];

	// Load from SSM with env var fallback
	const stage = process.env.STAGE || 'dev';
	stripePaymentMethodsPromise = (async () => {
		try {
			const configValue = await getConfigWithEnvFallback(stage, 'StripePaymentMethods', 'STRIPE_PAYMENT_METHODS');
			
			if (configValue) {
				try {
					// Parse JSON array
					const parsed = JSON.parse(configValue) as string[];
					if (Array.isArray(parsed) && parsed.length > 0) {
						// Validate that all values are strings
						const validMethods = parsed.filter(m => typeof m === 'string' && m.trim().length > 0);
						if (validMethods.length > 0) {
							stripePaymentMethodsCache = validMethods;
							stripePaymentMethodsCacheTimestamp = Date.now();
							return stripePaymentMethodsCache;
						}
					}
				} catch (parseError) {
					// Invalid JSON, fall back to default
				}
			}
			
			// Fallback to default if SSM value is invalid or missing
			stripePaymentMethodsCache = defaultPaymentMethods;
			stripePaymentMethodsCacheTimestamp = Date.now();
			return stripePaymentMethodsCache;
		} catch (error) {
			// Fallback to env var if SSM fails
			const envProc = (globalThis as any).process;
			const envValue = envProc?.env?.STRIPE_PAYMENT_METHODS;
			if (envValue) {
				try {
					const parsed = JSON.parse(envValue) as string[];
					if (Array.isArray(parsed) && parsed.length > 0) {
						const validMethods = parsed.filter(m => typeof m === 'string' && m.trim().length > 0);
						if (validMethods.length > 0) {
							stripePaymentMethodsCache = validMethods;
							stripePaymentMethodsCacheTimestamp = Date.now();
							return stripePaymentMethodsCache;
						}
					}
				} catch {
					// Invalid JSON in env var, fall back to default
				}
			}
			
			// Final fallback to default
			stripePaymentMethodsCache = defaultPaymentMethods;
			stripePaymentMethodsCacheTimestamp = Date.now();
			return stripePaymentMethodsCache;
		} finally {
			stripePaymentMethodsPromise = null;
		}
	})();

	return stripePaymentMethodsPromise;
}

/**
 * Creates a Stripe Checkout session with PhotoCloud branding and Polish payment methods
 * @param stripe - Stripe instance
 * @param params - Checkout session parameters
 * @returns Stripe Checkout session
 */
export async function createStripeCheckoutSession(
	stripe: any,
	params: {
		lineItems: any[];
		successUrl: string;
		cancelUrl: string;
		metadata: Record<string, string>;
		clientReferenceId?: string;
		mode?: 'payment' | 'subscription' | 'setup';
	}
): Promise<any> {
	// Get payment methods from SSM configuration
	const paymentMethods = await getStripePaymentMethods();
	
	return await stripe.checkout.sessions.create({
		payment_method_types: paymentMethods,
		mode: params.mode || 'payment',
		line_items: params.lineItems,
		success_url: params.successUrl,
		cancel_url: params.cancelUrl,
		metadata: params.metadata,
		client_reference_id: params.clientReferenceId,
		branding_settings: {
			background_color: '#FFFAF5',  // photographer-background
			button_color: '#7A5F4A',       // photographer-accentHover (darker for contrast)
			border_style: 'rounded',
			display_name: 'PhotoCloud'
		}
	});
}

