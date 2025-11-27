import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Express, Request, Response } from 'express';

/**
 * Converts API Gateway event to Express request and handles response
 * Uses serverless-http pattern for compatibility
 */
export function createServerlessHandler(app: Express) {
	return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
		// CORS headers to include in all responses (including errors)
		// API Gateway HTTP API v2 is case-sensitive, so use exact header names
		const corsHeaders: Record<string, string> = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
			'Access-Control-Max-Age': '86400',
		};
		
		// Normalize event format
		const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
		const path = event.requestContext?.http?.path || event.path || '/';
		
		// Handle OPTIONS preflight requests early - return immediately without Express processing
		// This is needed because the catch-all route with authorizer might interfere with API Gateway's built-in CORS
		if (method === 'OPTIONS' || method === 'options') {
			return {
				statusCode: 200,
				headers: corsHeaders,
				body: '',
			};
		}
		
		// Log request for debugging (can be removed in production)
		console.log('Lambda handler invoked:', { method, path, hasBody: !!event.body });
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
			let resolved = false;
			
			// Helper to safely resolve the promise only once
			const safeResolve = (response: APIGatewayProxyResult) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeoutId);
					resolve(response);
				}
			};
			
			// Safety timeout - if no response is sent within 25 seconds, return 503
			// This prevents Lambda from timing out and ensures we always return a response
			const timeoutId = setTimeout(() => {
				if (!resolved) {
					console.error('Lambda handler timeout: No response sent within 25 seconds', { 
						method, 
						path,
						remainingTime: context.getRemainingTimeInMillis ? context.getRemainingTimeInMillis() : 'unknown'
					});
					safeResolve({
						statusCode: 503,
						headers: {
							'content-type': 'application/json',
							...corsHeaders,
						},
						body: JSON.stringify({ 
							error: 'Service Unavailable', 
							message: 'Request timeout - no response received from handler' 
						}),
					});
				}
			}, 25000); // 25 seconds (5 seconds before Lambda timeout)

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
					// Ensure CORS headers are always included
					const finalHeaders = { ...corsHeaders, ...this.headers };
					safeResolve({
						statusCode: this.statusCode,
						headers: finalHeaders,
						body: this.body,
					});
					return this;
				},
				send: function(data: string | object | Buffer) {
					if (Buffer.isBuffer(data)) {
						// Handle binary data - convert to base64 for API Gateway
						this.body = data.toString('base64');
						// Mark as base64 encoded so API Gateway knows to decode it
						// Ensure CORS headers are always included
						const finalHeaders = { ...corsHeaders, ...this.headers };
						safeResolve({
							statusCode: this.statusCode,
							headers: finalHeaders,
							body: this.body,
							isBase64Encoded: true
						});
						return this;
					} else if (typeof data === 'object') {
						this.body = JSON.stringify(data);
						if (!this.headers['content-type']) {
							this.headers['content-type'] = 'application/json';
						}
					} else {
						this.body = data;
					}
					// Ensure CORS headers are always included
					const finalHeaders = { ...corsHeaders, ...this.headers };
					safeResolve({
						statusCode: this.statusCode,
						headers: finalHeaders,
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
				end: function(data?: string | Buffer) {
					if (data) {
						if (Buffer.isBuffer(data)) {
							// Handle binary data - convert to base64 for API Gateway
							this.body = data.toString('base64');
							// Mark as base64 encoded so API Gateway knows to decode it
							// Ensure CORS headers are always included
							const finalHeaders = { ...corsHeaders, ...this.headers };
							safeResolve({
								statusCode: this.statusCode,
								headers: finalHeaders,
								body: this.body,
								isBase64Encoded: true
							});
							return this;
						} else {
							this.body = data;
						}
					}
					// Ensure CORS headers are always included
					const finalHeaders = { ...corsHeaders, ...this.headers };
					safeResolve({
						statusCode: this.statusCode,
						headers: finalHeaders,
						body: this.body,
					});
					return this;
				},
			}) as any;

			// Error handler - ensure CORS headers are always included
			const next = (err?: any) => {
				if (err) {
					console.error('Express error:', err);
					safeResolve({
						statusCode: 500,
						headers: {
							'content-type': 'application/json',
							...corsHeaders,
						},
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
				// Handle both sync and async Express handlers
				const result = app(req as Request, res as Response, next);
				
				// If Express returns a Promise (async handler), wait for it
				if (result && typeof result.then === 'function') {
					result.catch((err: any) => {
						console.error('Unhandled async error:', err);
						safeResolve({
							statusCode: 500,
							headers: {
								'content-type': 'application/json',
								...corsHeaders,
							},
							body: JSON.stringify({ error: 'Internal server error', message: err.message }),
						});
					});
				}
			} catch (err: any) {
				// Ensure CORS headers are included even on unhandled errors
				console.error('Express app execution error:', err);
				safeResolve({
					statusCode: 500,
					headers: {
						'content-type': 'application/json',
						...corsHeaders,
					},
					body: JSON.stringify({ error: 'Internal server error', message: err.message }),
				});
			}
		});
	};
}

