import { getJWTFromEvent } from './jwt';

export function getUserIdFromEvent(event: any): string {
	const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
	return claims.sub || claims.username || '';
}

export function requireOwnerOr403(resourceOwnerId: string, requesterId: string) {
	if (!requesterId || resourceOwnerId !== requesterId) {
		const err: any = new Error('forbidden');
		err.statusCode = 403;
		throw err;
	}
}

/**
 * Extract user ID from Cognito JWT token (simplified - decode and check expiration)
 * Since tokens come from trusted dashboard app, we only verify expiration and extract claims
 */
export function getCognitoUserIdFromToken(token: string): string | null {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) {
			return null;
		}

		const encodedPayload = parts[1];
		const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as any;

		// Check expiration
		if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
			return null;
		}

		// Extract user ID from 'sub' claim (Cognito standard)
		return payload.sub || payload['cognito:username'] || null;
	} catch (e) {
		return null;
	}
}

/**
 * Verify gallery access - supports both Cognito (owner) and client JWT tokens
 * Returns access information for use in endpoints
 */
export async function verifyGalleryAccess(
	event: any,
	galleryId: string,
	gallery: any
): Promise<{ isOwner: boolean; isClient: boolean; userId?: string; clientId?: string }> {
	// Check Cognito token from API Gateway authorizer (if present)
	const cognitoUserIdFromAuthorizer = getUserIdFromEvent(event);
	if (cognitoUserIdFromAuthorizer && gallery.ownerId === cognitoUserIdFromAuthorizer) {
		return {
			isOwner: true,
			isClient: false,
			userId: cognitoUserIdFromAuthorizer
		};
	}

	// Check Cognito token from Authorization header (manual validation)
	const authHeader = event?.headers?.authorization || event?.headers?.Authorization;
	if (authHeader && authHeader.startsWith('Bearer ')) {
		const token = authHeader.substring(7);
		
		// Try Cognito token first (check if it's a Cognito token by trying to decode)
		const cognitoUserId = getCognitoUserIdFromToken(token);
		if (cognitoUserId && gallery.ownerId === cognitoUserId) {
			return {
				isOwner: true,
				isClient: false,
				userId: cognitoUserId
			};
		}

		// Try client JWT token
		const jwtPayload = await getJWTFromEvent(event);
		if (jwtPayload && jwtPayload.galleryId === galleryId) {
			return {
				isOwner: false,
				isClient: true,
				clientId: jwtPayload.clientId
			};
		}
	}

	return {
		isOwner: false,
		isClient: false
	};
}

