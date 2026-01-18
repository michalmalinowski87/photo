import { getConfigWithEnvFallback } from './ssm-config';

// Cache for Stripe secrets to avoid repeated SSM calls
let stripeSecretKeyCache: string | null = null;
let stripeSecretKeyPromise: Promise<string> | null = null;
let stripeWebhookSecretCache: string | null = null;
let stripeWebhookSecretPromise: Promise<string | undefined> | null = null;

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

