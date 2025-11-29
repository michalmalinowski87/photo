import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Express, Request, Response } from 'express';
import { Readable, Writable } from 'stream';

// Type for HTTP API v2 event properties (not in standard APIGatewayProxyEvent)
interface HttpApiV2Event {
	requestContext?: {
		http?: {
			method?: string;
			path?: string;
		};
		httpMethod?: string;
		identity?: {
			sourceIp?: string;
		};
		[key: string]: any;
	};
	rawQueryString?: string;
	path?: string;
	httpMethod?: string;
	[key: string]: any;
}

/**
 * Helper to extract HTTP method from event (supports both REST API and HTTP API v2)
 */
function getMethod(event: APIGatewayProxyEvent | HttpApiV2Event): string {
	const httpApiV2 = event as HttpApiV2Event;
	return httpApiV2?.requestContext?.http?.method ||
		httpApiV2?.requestContext?.httpMethod ||
		httpApiV2?.httpMethod ||
		(event as any)?.method ||
		'';
}

/**
 * Helper to extract path from event (supports both REST API and HTTP API v2)
 */
function getPath(event: APIGatewayProxyEvent | HttpApiV2Event): string {
	const httpApiV2 = event as HttpApiV2Event;
	return httpApiV2?.requestContext?.http?.path ||
		httpApiV2?.path ||
		'/';
}

/**
 * Helper to extract raw query string from event (HTTP API v2 only)
 */
function getRawQueryString(event: APIGatewayProxyEvent | HttpApiV2Event): string {
	const httpApiV2 = event as HttpApiV2Event;
	return httpApiV2?.rawQueryString || '';
}

/**
 * Helper to check if request is OPTIONS
 */
function isOptionsRequest(method: string, headers?: Record<string, string | undefined>): boolean {
	const methodIsOptions = method && (
		method.toUpperCase() === 'OPTIONS'
	);
	
	const hasCorsPreflight = headers && (
		headers['access-control-request-method'] ||
		headers['Access-Control-Request-Method'] ||
		Object.keys(headers).some(key => key.toLowerCase() === 'access-control-request-method')
	);
	
	return methodIsOptions || !!hasCorsPreflight;
}

/**
 * Converts API Gateway event to Express request and handles response
 * Supports both REST API and HTTP API v2 formats
 */
export function createServerlessHandler(app: Express) {
	return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
		const corsHeaders: Record<string, string> = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
			'Access-Control-Max-Age': '86400',
		};
		
		// Handle OPTIONS preflight requests first
		const method = getMethod(event);
		if (isOptionsRequest(method, event.headers)) {
			return {
				statusCode: 200,
				headers: corsHeaders,
				body: '',
			};
		}
		
		try {
			// Extract event properties (supports both REST API and HTTP API v2)
			const path = getPath(event);
			const rawQueryString = getRawQueryString(event);
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

			// Log request for debugging
			console.log('Lambda handler invoked:', { method, path, hasBody: !!body });

			// Create Express-compatible request stream
			const reqStream = new Readable();
			reqStream.push(body || '');
			reqStream.push(null);
			
			return new Promise<APIGatewayProxyResult>((resolve) => {
			let resolved = false;
			
			// Helper to safely resolve the promise only once
			const safeResolve = (response: APIGatewayProxyResult) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeoutId);
					resolve(response);
				}
			};
			
			// Helper to create response with CORS headers
			const createResponse = (
				statusCode: number, 
				body: string, 
				extraHeaders: Record<string, string> = {},
				isBase64 = false
			): APIGatewayProxyResult => {
				return {
					statusCode,
					headers: { ...corsHeaders, ...extraHeaders },
					body,
					...(isBase64 && { isBase64Encoded: true })
				};
			};
			
			// Safety timeout - if no response is sent within 25 seconds, return 503
			const timeoutId = setTimeout(() => {
				if (!resolved) {
					console.error('Lambda handler timeout: No response sent within 25 seconds', { 
						method, 
						path,
						remainingTime: context.getRemainingTimeInMillis ? context.getRemainingTimeInMillis() : 'unknown'
					});
					safeResolve(createResponse(
						503,
						JSON.stringify({ 
							error: 'Service Unavailable', 
							message: 'Request timeout - no response received from handler' 
						}),
						{ 'content-type': 'application/json' }
					));
				}
			}, 25000);

			// Build query string for URL
			const queryPart = rawQueryString ? `?${rawQueryString}` : '';
			const fullUrl = path + queryPart;
			
			const req = Object.assign(reqStream, {
				method,
				path,
				url: fullUrl,
				originalUrl: fullUrl,
				headers: headers as any,
				query: queryString,
				params: pathParameters,
				body: parsedBody,
				pathParameters,
				requestContext: event.requestContext || {},
				rawQueryString: rawQueryString,
				multiValueQueryStringParameters: event.multiValueQueryStringParameters,
				multiValueHeaders: event.multiValueHeaders,
				ip: (event.requestContext as any)?.identity?.sourceIp ||
					(event.requestContext as any)?.http?.sourceIp ||
					'',
				protocol: 'https',
				secure: true,
			}) as any;

			// Create minimal response stream for Express compatibility
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
					safeResolve(createResponse(this.statusCode, this.body, this.headers));
					return this;
				},
				send: function(data: string | object | Buffer) {
					if (Buffer.isBuffer(data)) {
						// Handle binary data - convert to base64 for API Gateway
						this.body = data.toString('base64');
						safeResolve(createResponse(this.statusCode, this.body, this.headers, true));
						return this;
					} else if (typeof data === 'object') {
						this.body = JSON.stringify(data);
						if (!this.headers['content-type']) {
							this.headers['content-type'] = 'application/json';
						}
					} else {
						this.body = data;
					}
					safeResolve(createResponse(this.statusCode, this.body, this.headers));
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
							this.body = data.toString('base64');
							safeResolve(createResponse(this.statusCode, this.body, this.headers, true));
							return this;
						} else {
							this.body = data;
						}
					}
					safeResolve(createResponse(this.statusCode, this.body, this.headers));
					return this;
				},
			}) as any;

			// Error handler
			const next = (err?: any) => {
				if (err) {
					console.error('Express error:', err);
					safeResolve(createResponse(
						500,
						JSON.stringify({ error: 'Internal server error', message: err.message }),
						{ 'content-type': 'application/json' }
					));
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
				// Express app() can return void or Promise, so we need to check
				const result: any = app(req as Request, res as Response, next);
				
				// If Express returns a Promise (async handler), wait for it
				if (result != null && typeof result === 'object' && typeof result.then === 'function') {
					result.catch((err: any) => {
						console.error('Unhandled async error:', err);
						safeResolve(createResponse(
							500,
							JSON.stringify({ error: 'Internal server error', message: err.message }),
							{ 'content-type': 'application/json' }
						));
					});
				}
			} catch (err: any) {
				console.error('Express app execution error:', err);
				safeResolve(createResponse(
					500,
					JSON.stringify({ error: 'Internal server error', message: err.message }),
					{ 'content-type': 'application/json' }
				));
			}
		});
		} catch (err: any) {
			console.error('Handler error:', err);
			
			// If we can't determine method or it might be OPTIONS, return success for CORS
			const possibleMethod = getMethod(event);
			if (isOptionsRequest(possibleMethod, event.headers) || !possibleMethod) {
				return {
					statusCode: 200,
					headers: corsHeaders,
					body: '',
				};
			}
			
			// Return error with CORS headers
			return {
				statusCode: 500,
				headers: {
					'content-type': 'application/json',
					...corsHeaders,
				},
				body: JSON.stringify({ 
					error: 'Internal server error', 
					message: err?.message || 'Unknown error occurred' 
				}),
			};
		}
	};
}

