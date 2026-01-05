type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
	debug: (msg: string, details?: Record<string, unknown>) => void;
	info: (msg: string, details?: Record<string, unknown>) => void;
	warn: (msg: string, details?: Record<string, unknown>) => void;
	error: (msg: string, details?: Record<string, unknown>, error?: Error | unknown) => void;
	withContext: (context: Record<string, unknown>) => Logger;
}

function output(level: LogLevel, base: Record<string, unknown>, msg: string, details?: Record<string, unknown>, error?: Error | unknown) {
	const record: Record<string, unknown> = { 
		level, 
		msg, 
		...base, 
		...(details || {}), 
		time: new Date().toISOString() 
	};

	// Enhanced error logging with stack traces
	if (error) {
		if (error instanceof Error) {
			record.error = {
				name: error.name,
				message: error.message,
				stack: error.stack
			};
		} else {
			record.error = {
				message: String(error)
			};
		}
	}

	// Basic JSON logging; can be replaced by pino transport at runtime
	process.stdout.write(JSON.stringify(record) + '\n');
}

export function createLogger(context: Record<string, unknown> = {}): Logger {
	const base = { service: 'photocloud', ...context };
	return {
		debug: (msg, d) => output('debug', base, msg, d),
		info: (msg, d) => output('info', base, msg, d),
		warn: (msg, d) => output('warn', base, msg, d),
		error: (msg, d, err) => output('error', base, msg, d, err),
		withContext: (ctx) => createLogger({ ...base, ...ctx })
	};
}

export function lambdaLogger<A extends { awsRequestId?: string }>(fn: (event: any, context: any) => Promise<any>) {
	return async (event: any, context: any) => {
		const startTime = Date.now();
		const logger = createLogger({ 
			functionName: context.functionName, 
			requestId: context.awsRequestId,
			stage: process.env.STAGE || (globalThis as any).process?.env?.STAGE || 'unknown'
		});
		(context as any).logger = logger;
		
		// Log function invocation with key event details
		const eventSummary: Record<string, unknown> = {
			httpMethod: event?.httpMethod,
			path: event?.path,
			pathParameters: event?.pathParameters ? Object.keys(event.pathParameters) : undefined,
			hasBody: !!event?.body,
			bodySize: event?.body ? String(event.body).length : 0,
			queryParams: event?.queryStringParameters ? Object.keys(event.queryStringParameters) : undefined,
			recordCount: event?.Records?.length,
			eventSource: event?.source || event?.Records?.[0]?.eventSource
		};
		
		logger.info('lambda.invoked', eventSummary);
		
		try {
			const res = await fn(event, context);
			const duration = Date.now() - startTime;
			const remainingTime = context?.getRemainingTimeInMillis?.();
			
			logger.info('lambda.completed', {
				durationMs: duration,
				remainingTimeMs: remainingTime,
				hasResponse: !!res,
				statusCode: res?.statusCode
			});
			return res;
		} catch (err: any) {
			const duration = Date.now() - startTime;
			const remainingTime = context?.getRemainingTimeInMillis?.();
			
			logger.error('lambda.failed', {
				durationMs: duration,
				remainingTimeMs: remainingTime,
				errorName: err?.name,
				errorMessage: err?.message
			}, err);
			throw err;
		}
	};
}

