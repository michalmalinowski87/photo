import { Request } from 'express';
import { getUserIdFromEvent } from '../../../lib/src/auth';

/**
 * Converts Express request to Lambda event format for compatibility with existing handler code
 * Preserves the original requestContext from API Gateway (including authorizer context)
 */
export function reqToEvent(req: Request): any {
	const originalRequestContext = (req as any).requestContext || {};
	return {
		pathParameters: req.params,
		queryStringParameters: req.query as any,
		body: JSON.stringify(req.body),
		headers: req.headers as any,
		httpMethod: req.method,
		requestContext: {
			...originalRequestContext,
			http: {
				method: req.method,
				path: req.path,
				...(originalRequestContext.http || {}),
			},
			identity: {
				sourceIp: (req as any).ip || '',
				...(originalRequestContext.identity || {}),
			},
			// Preserve authorizer context from API Gateway
			authorizer: originalRequestContext.authorizer || {},
		}
	};
}

/**
 * Gets user ID from Express request (converts to event format first)
 */
export function getUserIdFromRequest(req: Request): string | null {
	const event = reqToEvent(req);
	return getUserIdFromEvent(event);
}

/**
 * Middleware to attach logger to request (for compatibility)
 */
export function attachLogger(req: Request, res: any, next: any) {
	// Logger will be attached by lambdaLogger wrapper
	(req as any).logger = (req as any).logger || {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
	};
	next();
}

