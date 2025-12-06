import { Request } from 'express';
import { getUserIdFromEvent } from '../../../lib/src/auth';

/**
 * Converts Express request to Lambda event format for compatibility with existing handler code
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
			authorizer: originalRequestContext.authorizer || {},
		}
	};
}

export function getUserIdFromRequest(req: Request): string | null {
	const event = reqToEvent(req);
	return getUserIdFromEvent(event);
}

export function attachLogger(req: Request, res: any, next: any) {
	(req as any).logger = (req as any).logger || {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
	};
	next();
}

