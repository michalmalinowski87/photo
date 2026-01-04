import { createHmac } from 'crypto';
import { getConfigWithEnvFallback } from './ssm-config';

// Simple JWT implementation using HMAC-SHA256
// For production, consider using a library like jsonwebtoken or AWS KMS

// Cache for JWT secret to avoid repeated SSM calls
let jwtSecretCache: string | null = null;
let jwtSecretPromise: Promise<string> | null = null;

async function getJwtSecret(): Promise<string> {
	// Return cached value if available
	if (jwtSecretCache) {
		return jwtSecretCache;
	}

	// Return existing promise if already loading
	if (jwtSecretPromise) {
		return jwtSecretPromise;
	}

	// Load from SSM with env var fallback
	const stage = process.env.STAGE || 'dev';
	jwtSecretPromise = (async () => {
		try {
			const secret = await getConfigWithEnvFallback(stage, 'JwtSecret', 'JWT_SECRET');
			
			if (!secret) {
				// In production, JWT_SECRET must be set
				if (stage === 'prod' || stage === 'production') {
					throw new Error('JWT_SECRET is required in production (check SSM Parameter Store or JWT_SECRET env var)');
				}
				// In development, allow fallback but warn
				console.warn('⚠️  JWT_SECRET not set, using insecure default. This should only be used in development.');
				jwtSecretCache = 'change-me-in-production';
				return jwtSecretCache;
			}
			
			jwtSecretCache = secret;
			return jwtSecretCache;
		} catch (error) {
			// Fallback to env var if SSM fails
			const envSecret = process.env.JWT_SECRET;
			if (envSecret) {
				jwtSecretCache = envSecret;
				return jwtSecretCache;
			}
			throw error;
		}
	})();

	return jwtSecretPromise;
}

interface JWTPayload {
	galleryId: string;
	clientId: string;
	exp?: number;
	iat?: number;
}

export async function signJWT(payload: JWTPayload, expiresInSeconds: number = 7 * 24 * 3600): Promise<string> {
	const secret = await getJwtSecret();
	const header = {
		alg: 'HS256',
		typ: 'JWT'
	};

	const now = Math.floor(Date.now() / 1000);
	const jwtPayload: JWTPayload = {
		...payload,
		iat: now,
		exp: now + expiresInSeconds
	};

	const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
	const encodedPayload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');

	const signature = createHmac('sha256', secret)
		.update(`${encodedHeader}.${encodedPayload}`)
		.digest('base64url');

	return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
	try {
		const secret = await getJwtSecret();
		const parts = token.split('.');
		if (parts.length !== 3) {
			return null;
		}

		const [encodedHeader, encodedPayload, signature] = parts;

		// Verify signature
		const expectedSignature = createHmac('sha256', secret)
			.update(`${encodedHeader}.${encodedPayload}`)
			.digest('base64url');

		if (signature !== expectedSignature) {
			return null;
		}

		// Decode payload
		const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as JWTPayload;

		// Check expiration
		if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
			return null;
		}

		return payload;
	} catch (e) {
		return null;
	}
}

export async function getJWTFromEvent(event: any): Promise<JWTPayload | null> {
	const authHeader = event?.headers?.authorization || event?.headers?.Authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}

	const token = authHeader.substring(7);
	return verifyJWT(token);
}

