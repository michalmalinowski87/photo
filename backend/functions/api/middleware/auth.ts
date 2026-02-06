import { Request, Response, NextFunction } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromRequest } from '../routes/helpers';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Express middleware to require authentication
 * Checks if user is authenticated via API Gateway authorizer
 * Also verifies user is not deleted
 * Returns 401 if not authenticated, 403 if user is deleted
 * 
 * OPTIONS requests (CORS preflight) are allowed through without auth
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
	if (req.method === 'OPTIONS') {
		return next();
	}
	
	const userId = getUserIdFromRequest(req);
	const requestContext = (req as any).requestContext || {};
	const hasAuthorizer = !!requestContext.authorizer;
	// HTTP API v2 JWT authorizers put claims directly at authorizer.claims (not authorizer.jwt.claims)
	const hasJWT = !!requestContext.authorizer?.jwt;
	const hasClaims = !!(requestContext.authorizer?.jwt?.claims || requestContext.authorizer?.claims);
	
	// Debug: Log full requestContext structure for troubleshooting
	if (!userId) {
		const logger = (req as any).logger;
		logger?.warn('Auth check failed', {
			path: req.path,
			method: req.method,
			hasRequestContext: !!requestContext,
			hasAuthorizer,
			hasJWT,
			hasClaims,
			authorizerKeys: requestContext.authorizer ? Object.keys(requestContext.authorizer) : [],
			requestContextKeys: Object.keys(requestContext),
			// Log full authorizer structure (sanitized - no sensitive data)
			authorizerStructure: requestContext.authorizer ? JSON.stringify({
				hasJwt: !!requestContext.authorizer.jwt,
				jwtKeys: requestContext.authorizer.jwt ? Object.keys(requestContext.authorizer.jwt) : [],
				hasClaims: !!requestContext.authorizer.jwt?.claims,
				claimKeys: requestContext.authorizer.jwt?.claims ? Object.keys(requestContext.authorizer.jwt.claims) : []
			}) : 'no authorizer',
			ip: req.ip || req.headers['x-forwarded-for']
		});
		return res.status(401).json({ 
			error: 'Unauthorized',
			message: 'Authentication required. Please log in.'
		});
	}
	
	// Check if user is deleted (security: prevent deleted users from accessing the API)
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	
	if (usersTable) {
		try {
			const userResult = await ddb.send(new GetCommand({
				TableName: usersTable,
				Key: { userId }
			}));
			
			if (userResult.Item) {
				const user = userResult.Item as any;
				if (user.status === 'deleted') {
					return res.status(403).json({
						error: 'Forbidden',
						message: 'Your account has been deleted. Please contact support if you believe this is an error.'
					});
				}
			}
		} catch (error: any) {
			// If we can't check user status, log but don't block (fail open for availability)
			// In production, you might want to fail closed for security
			const logger = (req as any).logger;
			logger?.error('Failed to check user deletion status', {
				userId,
				path: req.path,
				errorName: error.name,
				errorMessage: error.message
			}, error);
			// Continue - don't block requests if DynamoDB check fails
		}
	}
	
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

