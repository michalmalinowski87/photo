import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Express, Request, Response } from 'express';
import { Readable, Writable } from 'stream';
import { sanitizeErrorMessage } from '../../lib/src/error-utils';

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
		
		const method = getMethod(event);
		if (isOptionsRequest(method, event.headers)) {
			return {
				statusCode: 200,
				headers: corsHeaders,
				body: '',
			};
		}
		
		try {
			const path = getPath(event);
			const rawQueryString = getRawQueryString(event);
			const queryString = event.queryStringParameters || {};
			const headers: Record<string, string> = {};
			
			Object.keys(event.headers || {}).forEach(key => {
				headers[key.toLowerCase()] = event.headers![key] || '';
			});

			const body = event.body || '';
			const pathParameters = event.pathParameters || {};

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

			console.log('Lambda handler invoked:', { method, path, hasBody: !!body });

			const reqStream = new Readable();
			reqStream.push(body || '');
			reqStream.push(null);
			
			return new Promise<APIGatewayProxyResult>((resolve) => {
			let resolved = false;
			
			const safeResolve = (response: APIGatewayProxyResult) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeoutId);
					resolve(response);
				}
			};
			
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
			
			// Safety timeout: if no response is sent within 25 seconds, return 503
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

			const resStream = new Writable({
				write(chunk: any, encoding: string, callback: () => void) {
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

			const next = (err?: any) => {
				if (err) {
					console.error('Express error:', err);
					const safeMessage = sanitizeErrorMessage(err);
					safeResolve(createResponse(
						500,
						JSON.stringify({ error: 'Internal server error', message: safeMessage }),
						{ 'content-type': 'application/json' }
					));
				}
			};

			(req as any).logger = (context as any).logger || {
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
			};

			try {
				// Express app() can return void or Promise, so we need to check
				const result: any = app(req as Request, res as Response, next);
				
				if (result != null && typeof result === 'object' && typeof result.then === 'function') {
					result.catch((err: any) => {
						console.error('Unhandled async error:', err);
						const safeMessage = sanitizeErrorMessage(err);
						safeResolve(createResponse(
							500,
							JSON.stringify({ error: 'Internal server error', message: safeMessage }),
							{ 'content-type': 'application/json' }
						));
					});
				}
			} catch (err: any) {
				console.error('Express app execution error:', err);
				const safeMessage = sanitizeErrorMessage(err);
				safeResolve(createResponse(
					500,
					JSON.stringify({ error: 'Internal server error', message: safeMessage }),
					{ 'content-type': 'application/json' }
				));
			}
		});
		} catch (err: any) {
			console.error('Handler error:', err);
			
			const possibleMethod = getMethod(event);
			if (isOptionsRequest(possibleMethod, event.headers) || !possibleMethod) {
				return {
					statusCode: 200,
					headers: corsHeaders,
					body: '',
				};
			}
			
			const safeMessage = sanitizeErrorMessage(err);
			
			return {
				statusCode: 500,
				headers: {
					'content-type': 'application/json',
					...corsHeaders,
				},
				body: JSON.stringify({ 
					error: 'Internal server error', 
					message: safeMessage
				}),
			};
		}
	};
}

