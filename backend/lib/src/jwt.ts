import { createHmac, randomBytes } from 'crypto';

// Simple JWT implementation using HMAC-SHA256
// For production, consider using a library like jsonwebtoken or AWS KMS

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

interface JWTPayload {
	galleryId: string;
	clientId: string;
	exp?: number;
	iat?: number;
}

export function signJWT(payload: JWTPayload, expiresInSeconds: number = 7 * 24 * 3600): string {
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

	const signature = createHmac('sha256', JWT_SECRET)
		.update(`${encodedHeader}.${encodedPayload}`)
		.digest('base64url');

	return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJWT(token: string): JWTPayload | null {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) {
			return null;
		}

		const [encodedHeader, encodedPayload, signature] = parts;

		// Verify signature
		const expectedSignature = createHmac('sha256', JWT_SECRET)
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

export function getJWTFromEvent(event: any): JWTPayload | null {
	const authHeader = event?.headers?.authorization || event?.headers?.Authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}

	const token = authHeader.substring(7);
	return verifyJWT(token);
}

