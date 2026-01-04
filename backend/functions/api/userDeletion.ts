import express, { Request, Response } from 'express';
import { lambdaLogger } from '../../../packages/logger/src';
import { createServerlessHandler } from './serverless';
import { requireAuth } from './middleware/auth';
import { sanitizeErrorMessage } from '../../lib/src/error-utils';
import { userDeletionRoutes } from './routes/userDeletion';

const app = express();

// OPTIONS preflight requests are handled automatically by API Gateway's built-in CORS
// This middleware only sets CORS headers for actual API responses (GET, POST, etc.)
app.use((req: Request, res: Response, next) => {
	// Get allowed origins from environment variable
	const corsOrigins = process.env.CORS_ORIGINS;
	const stage = process.env.STAGE || 'dev';
	
	let allowedOrigin = '*';
	
	// In production or when CORS_ORIGINS is set, use specific origins
	if (corsOrigins) {
		const origin = req.headers.origin || '';
		const allowedOrigins = corsOrigins.split(',').map(o => o.trim());
		
		// Check if request origin is in allowed list
		if (allowedOrigins.includes(origin)) {
			allowedOrigin = origin;
		} else if (allowedOrigins.length === 1 && allowedOrigins[0] === '*') {
			// Explicit wildcard in env var
			allowedOrigin = '*';
		} else {
			// Origin not in allowed list - don't set CORS header (browser will block)
			allowedOrigin = '';
		}
	} else if (stage === 'prod') {
		// Production without CORS_ORIGINS - default to no CORS (most secure)
		allowedOrigin = '';
	}

	if (allowedOrigin) {
		res.header('Access-Control-Allow-Origin', allowedOrigin);
		res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
		res.header('Access-Control-Max-Age', '86400');
	}

	next();
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use(lambdaLogger());

// Apply authentication middleware to all routes
app.use(requireAuth);

// User deletion routes
app.use('/auth', userDeletionRoutes);

// Error handling middleware (must be last)
app.use((err: any, req: Request, res: Response, next: any) => {
	const logger = (req as any).logger;
	logger?.error('Unhandled error in user deletion API', {
		error: {
			name: err?.name,
			message: err?.message,
			stack: err?.stack
		},
		path: req.path,
		method: req.method
	});

	const sanitizedMessage = sanitizeErrorMessage(err?.message || 'Internal server error');
	res.status(err?.statusCode || 500).json({
		error: 'Internal server error',
		message: sanitizedMessage
	});
});

export const handler = createServerlessHandler(app);

