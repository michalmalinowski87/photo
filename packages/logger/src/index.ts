type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
	debug: (msg: string, details?: Record<string, unknown>) => void;
	info: (msg: string, details?: Record<string, unknown>) => void;
	warn: (msg: string, details?: Record<string, unknown>) => void;
	error: (msg: string, details?: Record<string, unknown>) => void;
	withContext: (context: Record<string, unknown>) => Logger;
}

function output(level: LogLevel, base: Record<string, unknown>, msg: string, details?: Record<string, unknown>) {
	const record = { level, msg, ...base, ...(details || {}), time: new Date().toISOString() };
	// Basic JSON logging; can be replaced by pino transport at runtime
	process.stdout.write(JSON.stringify(record) + '\n');
}

export function createLogger(context: Record<string, unknown> = {}): Logger {
	const base = { service: 'photohub', ...context };
	return {
		debug: (msg, d) => output('debug', base, msg, d),
		info: (msg, d) => output('info', base, msg, d),
		warn: (msg, d) => output('warn', base, msg, d),
		error: (msg, d) => output('error', base, msg, d),
		withContext: (ctx) => createLogger({ ...base, ...ctx })
	};
}

export function lambdaLogger<A extends { awsRequestId?: string }>(fn: (event: any, context: any) => Promise<any>) {
	return async (event: any, context: any) => {
		const logger = createLogger({ functionName: context.functionName, requestId: context.awsRequestId });
		(context as any).logger = logger;
		logger.debug('lambda.start');
		try {
			const res = await fn(event, context);
			logger.debug('lambda.success');
			return res;
		} catch (err: any) {
			logger.error('lambda.error', { error: err?.message || String(err) });
			throw err;
		}
	};
}

