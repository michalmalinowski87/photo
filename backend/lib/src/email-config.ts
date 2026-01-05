import { getConfigWithEnvFallback } from './ssm-config';

// Cache for email configuration to avoid repeated SSM calls
let senderEmailCache: string | null = null;
let senderEmailPromise: Promise<string | undefined> | null = null;

/**
 * Gets sender email from SSM Parameter Store with fallback to environment variable
 * Uses caching to avoid repeated SSM calls
 */
export async function getSenderEmail(): Promise<string | undefined> {
	// Return cached value if available (including undefined)
	if (senderEmailCache !== null) {
		return senderEmailCache || undefined;
	}

	// Return existing promise if already loading
	if (senderEmailPromise) {
		return senderEmailPromise;
	}

	// Load from SSM with env var fallback
	const stage = process.env.STAGE || 'dev';
	senderEmailPromise = (async () => {
		try {
			const email = await getConfigWithEnvFallback(stage, 'SenderEmail', 'SENDER_EMAIL');
			senderEmailCache = email || '';
			return email || undefined;
		} catch (error) {
			// Fallback to env var if SSM fails
			const envEmail = process.env.SENDER_EMAIL;
			senderEmailCache = envEmail || '';
			return envEmail || undefined;
		}
	})();

	return senderEmailPromise;
}

