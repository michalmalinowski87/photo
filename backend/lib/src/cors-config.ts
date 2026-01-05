import { getConfigWithEnvFallback } from './ssm-config';

// Cache for CORS origins to avoid repeated SSM calls
let corsOriginsCache: string | null = null;
let corsOriginsPromise: Promise<string | undefined> | null = null;
let corsOriginsCacheTimestamp = 0;
const CORS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Gets CORS origins from SSM Parameter Store with fallback to environment variable
 * Uses caching to avoid repeated SSM calls (CORS middleware runs on every request)
 */
export async function getCorsOrigins(): Promise<string | undefined> {
	const now = Date.now();
	
	// Return cached value if still valid
	if (corsOriginsCache !== null && (now - corsOriginsCacheTimestamp) < CORS_CACHE_TTL) {
		return corsOriginsCache || undefined;
	}

	// Return existing promise if already loading
	if (corsOriginsPromise) {
		return corsOriginsPromise;
	}

	// Load from SSM with env var fallback
	const stage = process.env.STAGE || 'dev';
	corsOriginsPromise = (async () => {
		try {
			const origins = await getConfigWithEnvFallback(stage, 'CorsOrigins', 'CORS_ORIGINS');
			corsOriginsCache = origins || '';
			corsOriginsCacheTimestamp = Date.now();
			return origins || undefined;
		} catch (error) {
			// Fallback to env var if SSM fails
			const envOrigins = process.env.CORS_ORIGINS;
			corsOriginsCache = envOrigins || '';
			corsOriginsCacheTimestamp = Date.now();
			return envOrigins || undefined;
		} finally {
			corsOriginsPromise = null;
		}
	})();

	return corsOriginsPromise;
}

