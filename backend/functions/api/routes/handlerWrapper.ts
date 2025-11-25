import { Request, Response } from 'express';
import { Handler } from 'aws-lambda';

/**
 * Wraps an existing Lambda handler to work as an Express route handler
 * This allows us to reuse existing handlers without rewriting them
 */
export function wrapHandler(handler: Handler) {
	return async (req: Request, res: Response) => {
		// Convert Express request to Lambda event format
		// Preserve the original requestContext from API Gateway (including authorizer context)
		const originalRequestContext = (req as any).requestContext || {};
		// Express has already parsed the body, so we need to stringify it for Lambda event format
		// But handle edge cases where body might be undefined, null, or already a string
		let bodyString: string;
		if (req.body === undefined || req.body === null) {
			bodyString = '';
		} else if (typeof req.body === 'string') {
			bodyString = req.body;
		} else {
			try {
				bodyString = JSON.stringify(req.body);
			} catch (err) {
				console.error('Failed to stringify req.body:', err);
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
				// Preserve authorizer context from API Gateway
				authorizer: originalRequestContext.authorizer || {},
			},
			rawQueryString: req.url.split('?')[1] || '',
			multiValueQueryStringParameters: undefined,
			multiValueHeaders: undefined,
		} as any;

		// Create context with logger
		const context = {
			functionName: 'api-handler',
			awsRequestId: `req-${Date.now()}`,
			logger: (req as any).logger,
		} as any;

		try {
			// Call the original handler
			const result = await handler(event, context, () => {});

			// Handle response
			if (result && typeof result === 'object') {
				const statusCode = result.statusCode || 200;
				const headers = result.headers || {};
				let body = result.body || '';

				// Handle base64-encoded binary responses
				if (result.isBase64Encoded && typeof body === 'string') {
					// Decode base64 to binary buffer
					try {
						const buffer = Buffer.from(body, 'base64');
						console.log('Decoding base64 binary response', {
							originalSize: body.length,
							decodedSize: buffer.length,
							contentType: headers['content-type']
						});
						// Set headers BEFORE sending
						Object.keys(headers).forEach(key => {
							res.setHeader(key, headers[key]);
						});
						// Use res.end() for binary data to ensure proper handling
						res.status(statusCode);
						res.end(buffer);
						return;
					} catch (decodeErr: any) {
						console.error('Failed to decode base64 body:', decodeErr);
						return res.status(500).json({ error: 'Failed to decode binary response' });
					}
				}

				// Set headers
				Object.keys(headers).forEach(key => {
					res.setHeader(key, headers[key]);
				});

				// Parse body if it's JSON
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

			// Fallback
			return res.status(500).json({ error: 'Invalid handler response' });
		} catch (error: any) {
			console.error('Handler error:', error);
			return res.status(500).json({ error: 'Internal server error', message: error.message });
		}
	};
}

