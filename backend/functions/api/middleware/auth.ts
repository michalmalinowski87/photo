import { Request, Response, NextFunction } from 'express';
import { getUserIdFromRequest } from '../routes/helpers';

/**
 * Express middleware to require authentication
 * Checks if user is authenticated via API Gateway authorizer
 * Returns 401 if not authenticated
 * 
 * OPTIONS requests (CORS preflight) are allowed through without auth
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
	// Allow OPTIONS requests (CORS preflight) to pass through without auth
	if (req.method === 'OPTIONS') {
		return next();
	}
	
	const userId = getUserIdFromRequest(req);
	const requestContext = (req as any).requestContext || {};
	const hasAuthorizer = !!requestContext.authorizer;
	const hasJWT = !!requestContext.authorizer?.jwt;
	const hasClaims = !!requestContext.authorizer?.jwt?.claims;
	
	// Debug logging (can be removed in production)
	if (!userId) {
		console.log('Auth check failed:', {
			path: req.path,
			method: req.method,
			hasRequestContext: !!requestContext,
			hasAuthorizer,
			hasJWT,
			hasClaims,
			authorizerKeys: requestContext.authorizer ? Object.keys(requestContext.authorizer) : []
		});
	}
	
	if (!userId) {
		return res.status(401).json({ 
			error: 'Unauthorized',
			message: 'Authentication required. Please log in.'
		});
	}
	
	// Attach userId to request for use in handlers
	(req as any).userId = userId;
	next();
}

/**
 * Optional auth middleware - attaches userId if present but doesn't require it
 * Useful for endpoints that work for both authenticated and unauthenticated users
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
	const userId = getUserIdFromRequest(req);
	if (userId) {
		(req as any).userId = userId;
	}
	next();
}

