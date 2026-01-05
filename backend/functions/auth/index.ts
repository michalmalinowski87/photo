import express, { Request, Response } from 'express';
import { lambdaLogger } from '../../../packages/logger/src';
import { createServerlessHandler } from '../api/serverless';
import { requireAuth } from '../api/middleware/auth';
import { sanitizeErrorMessage } from '../../lib/src/error-utils';
import { getCorsOrigins } from '../../lib/src/cors-config';

import { authRoutes } from '../api/routes/auth';
import { publicAuthRoutes } from '../api/routes/public-auth';

const app = express();

// OPTIONS preflight requests are handled automatically by API Gateway's built-in CORS
// This middleware only sets CORS headers for actual API responses (GET, POST, etc.)
app.use(async (req: Request, res: Response, next) => {
	// Get allowed origins from SSM Parameter Store with fallback to environment variable
	const corsOrigins = await getCorsOrigins();
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
			// Explicit wildcard in config
			allowedOrigin = '*';
		} else if (stage === 'dev' || stage === 'development') {
			// Allow all in development if origin doesn't match
			allowedOrigin = '*';
		} else {
			// In production with specific origins, reject if not in list
			allowedOrigin = allowedOrigins[0] || '*';
		}
	} else if (stage === 'prod' || stage === 'production') {
		// Production without CORS_ORIGINS set - default to wildcard with warning
		console.warn('⚠️  CORS_ORIGINS not set in production. Using wildcard. Set CORS_ORIGINS in SSM for security.');
	}
	
	res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
	res.setHeader('Access-Control-Max-Age', '86400');
	
	next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req: Request, res: Response) => {
	res.json({ ok: true });
});

// Public auth routes (no auth required)
app.use('/auth/public', publicAuthRoutes);

// Protected auth routes (require authentication)
app.use('/auth', requireAuth, authRoutes);

app.use((req: Request, res: Response) => {
	res.status(404).json({ error: 'Not found', path: req.path });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, req: Request, res: Response, _next: any) => {
	console.error('Unhandled error:', err);
	const safeMessage = sanitizeErrorMessage(err);
	res.status(500).json({ error: 'Internal server error', message: safeMessage });
});

export const handler = lambdaLogger(createServerlessHandler(app));

