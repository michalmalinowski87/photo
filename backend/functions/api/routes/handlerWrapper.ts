import { Request, Response } from 'express';
import { Handler } from 'aws-lambda';
import { sanitizeErrorMessage } from '../../../lib/src/error-utils';

/**
 * Wraps an existing Lambda handler to work as an Express route handler
 * This allows us to reuse existing handlers without rewriting them
 */
export function wrapHandler(handler: Handler) {
	return async (req: Request, res: Response) => {
		const originalRequestContext = (req as any).requestContext || {};
		// Express has already parsed the body, so we need to stringify it for Lambda event format
		let bodyString: string;
		if (req.body === undefined || req.body === null) {
			bodyString = '';
		} else if (typeof req.body === 'string') {
			bodyString = req.body;
		} else {
			try {
				bodyString = JSON.stringify(req.body);
			} catch (err) {
				const logger = (req as any).logger;
				logger?.error('Failed to stringify req.body', {}, err);
				bodyString = '';
			}
		}
		
		const event = {
			pathParameters: req.params,
			queryStringParameters: req.query as any,
			body: bodyString,
			headers: req.headers as any,
			httpMethod: req.method,
			path: req.path,
			requestContext: {
				...originalRequestContext,
				http: {
					method: req.method,
					path: req.path,
					...(originalRequestContext.http || {}),
				},
				identity: {
					sourceIp: req.ip || '',
					...(originalRequestContext.identity || {}),
				},
				authorizer: originalRequestContext.authorizer || {},
			},
			rawQueryString: req.url.split('?')[1] || '',
			multiValueQueryStringParameters: undefined,
			multiValueHeaders: undefined,
		} as any;

		const context = {
			functionName: 'api-handler',
			awsRequestId: `req-${Date.now()}`,
			logger: (req as any).logger,
		} as any;

		try {
			const result = await handler(event, context, () => {});

			if (result && typeof result === 'object') {
				const statusCode = result.statusCode || 200;
				const headers = result.headers || {};
				const body = result.body || '';

				if (result.isBase64Encoded && typeof body === 'string') {
					try {
						const buffer = Buffer.from(body, 'base64');
						const logger = (req as any).logger;
						logger?.debug('Decoding base64 binary response', {
							originalSize: body.length,
							decodedSize: buffer.length,
							contentType: headers['content-type']
						});
						// Set headers before sending to ensure proper binary handling
						Object.keys(headers).forEach(key => {
							res.setHeader(key, headers[key]);
						});
						res.status(statusCode);
						res.end(buffer);
						return;
					} catch (decodeErr: any) {
						const logger = (req as any).logger;
						logger?.error('Failed to decode base64 body', {}, decodeErr);
						return res.status(500).json({ error: 'Failed to decode binary response' });
					}
				}

				Object.keys(headers).forEach(key => {
					res.setHeader(key, headers[key]);
				});

				if (headers['content-type']?.includes('application/json') && typeof body === 'string') {
					try {
						const parsed = JSON.parse(body);
						return res.status(statusCode).json(parsed);
					} catch {
						return res.status(statusCode).send(body);
					}
				}

				return res.status(statusCode).send(body);
			}

			return res.status(500).json({ error: 'Invalid handler response' });
		} catch (error: any) {
			const logger = (req as any).logger;
			logger?.error('Handler error', {}, error);
			const safeMessage = sanitizeErrorMessage(error);
			return res.status(500).json({ error: 'Internal server error', message: safeMessage });
		}
	};
}

