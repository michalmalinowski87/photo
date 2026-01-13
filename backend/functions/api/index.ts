import express, { Request, Response } from 'express';
import { lambdaLogger } from '../../../packages/logger/src';
import { createServerlessHandler } from './serverless';
import { requireAuth } from './middleware/auth';
import { wrapHandler } from './routes/handlerWrapper';
import { sanitizeErrorMessage } from '../../lib/src/error-utils';

import { galleriesRoutes } from './routes/galleries';
import * as galleriesClientLogin from '../galleries/clientLogin';
import * as galleriesListImages from '../galleries/listImages';
import * as galleriesDownloadImage from '../galleries/downloadImage';
import * as galleriesGetStatus from '../galleries/getStatus';
import { ordersRoutes } from './routes/orders';
import * as ordersList from '../../functions/orders/list';
import * as ordersListDelivered from '../../functions/orders/listDelivered';
import * as ordersDownloadZip from '../../functions/orders/downloadZip';
import { clientsRoutes } from './routes/clients';
import { packagesRoutes } from './routes/packages';
// Stripe payments are handled by separate Lambda functions
import { transactionsRoutes } from './routes/transactions';
import { walletRoutes } from './routes/wallet';
import { uploadsRoutes } from './routes/uploads';
import { downloadsRoutes } from './routes/downloads';
import { selectionsRoutes } from './routes/selections';
import * as selectionsGet from '../../functions/selections/getSelection';
import * as selectionsApprove from '../../functions/selections/approveSelection';
import * as selectionsChangeRequest from '../../functions/selections/changeRequest';
import * as ordersListFinalImages from '../../functions/orders/listFinalImages';
import * as ordersDownloadFinalZip from '../../functions/orders/downloadFinalZip';
import { dashboardRoutes } from './routes/dashboard';
import { userDeletionRoutes, undoDeletionPublicRoutes } from './routes/userDeletion';
import { authRoutes } from './routes/auth';

const app = express();

import { getCorsOrigins } from '../../lib/src/cors-config';

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
		// CORS warning logged via logger in production
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

// Public gallery routes (no auth required)
// Client login endpoint - clients authenticate with gallery password, not Cognito
app.post('/galleries/:id/client-login', wrapHandler(galleriesClientLogin.handler));

// Client gallery endpoints (use client JWT tokens, not Cognito)
// These endpoints verify client JWT tokens in the Lambda function itself
app.get('/galleries/:id/images', wrapHandler(galleriesListImages.handler));
app.get('/galleries/:id/images/:imageKey/download', wrapHandler(galleriesDownloadImage.handler));
app.get('/galleries/:id/status', wrapHandler(galleriesGetStatus.handler));
app.get('/galleries/:id/orders', wrapHandler(ordersList.handler));
app.get('/galleries/:id/orders/delivered', wrapHandler(ordersListDelivered.handler));
app.get('/galleries/:id/selections', wrapHandler(selectionsGet.handler));
app.post('/galleries/:id/selections/approve', wrapHandler(selectionsApprove.handler));
app.post('/galleries/:id/selection-change-request', wrapHandler(selectionsChangeRequest.handler));
app.get('/galleries/:id/orders/:orderId/zip', wrapHandler(ordersDownloadZip.handler));
app.get('/galleries/:id/orders/:orderId/final/images', wrapHandler(ordersListFinalImages.handler));
app.get('/galleries/:id/orders/:orderId/final/zip', wrapHandler(ordersDownloadFinalZip.handler));
app.post('/galleries/:id/orders/:orderId/final/zip', wrapHandler(ordersDownloadFinalZip.handler));

// Public undo deletion route (no auth required - uses token in URL)
app.use('/auth', undoDeletionPublicRoutes);

// API Gateway validates tokens before requests reach Lambda, but we also check in middleware for extra safety
// Auth routes - some handled by separate auth Lambda function, some (like dev endpoints) handled here
// User deletion routes (require authentication)
app.use('/auth', requireAuth, userDeletionRoutes);
// Auth routes including dev endpoints (require authentication)
app.use('/auth', requireAuth, authRoutes);
app.use('/galleries', requireAuth, galleriesRoutes);
app.use('/clients', requireAuth, clientsRoutes);
app.use('/packages', requireAuth, packagesRoutes);
// Stripe payments (/payments/*) are handled by separate Lambda functions
app.use('/transactions', requireAuth, transactionsRoutes);
app.use('/wallet', requireAuth, walletRoutes);
app.use('/uploads', requireAuth, uploadsRoutes);
app.use('/downloads', requireAuth, downloadsRoutes);
// Orders routes handle their own paths (some under /galleries, some under /orders)
app.use('/', requireAuth, ordersRoutes);
app.use('/galleries', requireAuth, selectionsRoutes);
app.use('/dashboard', requireAuth, dashboardRoutes);

app.use((req: Request, res: Response) => {
	res.status(404).json({ error: 'Not found', path: req.path });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, req: Request, res: Response, _next: any) => {
	const logger = (req as any).logger;
	logger?.error('Unhandled error', {}, err);
	const safeMessage = sanitizeErrorMessage(err);
	res.status(500).json({ error: 'Internal server error', message: safeMessage });
});

export const handler = lambdaLogger(createServerlessHandler(app));

