import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Express, Request, Response } from 'express';

/**
 * Converts API Gateway event to Express request and handles response
 * Uses serverless-http pattern for compatibility
 */
export function createServerlessHandler(app: Express) {
	return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
		// Normalize event format
		const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
		const path = event.requestContext?.http?.path || event.path || '/';
		const queryString = event.queryStringParameters || {};
		const headers: Record<string, string> = {};
		
		// Normalize headers (lowercase keys)
		Object.keys(event.headers || {}).forEach(key => {
			headers[key.toLowerCase()] = event.headers![key] || '';
		});

		const body = event.body || '';
		const pathParameters = event.pathParameters || {};

		// Parse body if JSON
		let parsedBody: any = {};
		if (body) {
			try {
				if (headers['content-type']?.includes('application/json')) {
					parsedBody = JSON.parse(body);
				} else {
					parsedBody = body;
				}
			} catch (e) {
				parsedBody = body;
			}
		}

		// Create Express-compatible request
		// Need to create minimal stream-like objects for Express middleware compatibility
		const { Readable } = require('stream');
		const reqStream = new Readable();
		reqStream.push(body || '');
		reqStream.push(null); // End the stream
		
		return new Promise((resolve, reject) => {
			const req = Object.assign(reqStream, {
				method,
				path,
				url: path + (event.rawQueryString ? `?${event.rawQueryString}` : ''),
				originalUrl: path + (event.rawQueryString ? `?${event.rawQueryString}` : ''),
				headers: headers as any,
				query: queryString,
				params: pathParameters,
				body: parsedBody,
				pathParameters,
				requestContext: event.requestContext || {},
				rawQueryString: event.rawQueryString || '',
				multiValueQueryStringParameters: event.multiValueQueryStringParameters,
				multiValueHeaders: event.multiValueHeaders,
				ip: event.requestContext?.identity?.sourceIp || '',
				protocol: 'https',
				secure: true,
			}) as any;

			// Create minimal response stream for Express compatibility
			const { Writable } = require('stream');
			const resStream = new Writable({
				write(chunk: any, encoding: string, callback: () => void) {
					// Ignore writes - we handle response in our methods
					callback();
				}
			});
			
			const res = Object.assign(resStream, {
				statusCode: 200,
				headers: {} as Record<string, string>,
				body: '',
				status: function(code: number) {
					this.statusCode = code;
					return this;
				},
				json: function(data: any) {
					this.body = JSON.stringify(data);
					if (!this.headers['content-type']) {
						this.headers['content-type'] = 'application/json';
					}
					resolve({
						statusCode: this.statusCode,
						headers: this.headers,
						body: this.body,
					});
					return this;
				},
				send: function(data: string | object) {
					if (typeof data === 'object') {
						this.body = JSON.stringify(data);
						if (!this.headers['content-type']) {
							this.headers['content-type'] = 'application/json';
						}
					} else {
						this.body = data;
					}
					resolve({
						statusCode: this.statusCode,
						headers: this.headers,
						body: this.body,
					});
					return this;
				},
				setHeader: function(name: string, value: string) {
					this.headers[name.toLowerCase()] = value;
					return this;
				},
				getHeader: function(name: string) {
					return this.headers[name.toLowerCase()];
				},
				end: function(data?: string) {
					if (data) this.body = data;
					resolve({
						statusCode: this.statusCode,
						headers: this.headers,
						body: this.body,
					});
					return this;
				},
			}) as any;

			// Error handler
			const next = (err?: any) => {
				if (err) {
					console.error('Express error:', err);
					resolve({
						statusCode: 500,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ error: 'Internal server error', message: err.message }),
					});
				}
			};

			// Attach logger to request (for compatibility with lambdaLogger)
			(req as any).logger = (context as any).logger || {
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
			};

			// Execute Express app
			try {
				app(req as Request, res as Response, next);
			} catch (err: any) {
				reject(err);
			}
		});
	};
}

