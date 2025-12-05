import express, { Request, Response } from 'express';
import { lambdaLogger } from '../../../packages/logger/src';
import { createServerlessHandler } from './serverless';
import { requireAuth } from './middleware/auth';
import { wrapHandler } from './routes/handlerWrapper';

// Import route modules
import { authRoutes } from './routes/auth';
import { galleriesRoutes } from './routes/galleries';
import * as galleriesClientLogin from '../galleries/clientLogin';
import * as galleriesListImages from '../galleries/listImages';
import { ordersRoutes } from './routes/orders';
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
import { processedRoutes } from './routes/processed';
import { dashboardRoutes } from './routes/dashboard';

const app = express();

// CORS middleware - set CORS headers on all responses
// Note: OPTIONS preflight requests are handled automatically by API Gateway's built-in CORS
// This middleware only sets CORS headers for actual API responses (GET, POST, etc.)
app.use((req: Request, res: Response, next) => {
	// Set CORS headers for all responses
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
	res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
	
	next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (no auth required)
app.get('/health', (req: Request, res: Response) => {
	res.json({ ok: true });
});

// Public gallery routes (no auth required)
// Client login endpoint - clients authenticate with gallery password, not Cognito
app.post('/galleries/:id/client-login', wrapHandler(galleriesClientLogin.handler));

// Client gallery endpoints (use client JWT tokens, not Cognito)
// These endpoints verify client JWT tokens in the Lambda function itself
app.get('/galleries/:id/images', wrapHandler(galleriesListImages.handler));
app.get('/galleries/:id/orders/delivered', wrapHandler(ordersListDelivered.handler));
app.get('/galleries/:id/selections', wrapHandler(selectionsGet.handler));
app.post('/galleries/:id/selections/approve', wrapHandler(selectionsApprove.handler));
app.post('/galleries/:id/selection-change-request', wrapHandler(selectionsChangeRequest.handler));
app.get('/galleries/:id/orders/:orderId/zip', wrapHandler(ordersDownloadZip.handler));
app.get('/galleries/:id/orders/:orderId/final/images', wrapHandler(ordersListFinalImages.handler));
app.get('/galleries/:id/orders/:orderId/final/zip', wrapHandler(ordersDownloadFinalZip.handler)); // GET for polling
app.post('/galleries/:id/orders/:orderId/final/zip', wrapHandler(ordersDownloadFinalZip.handler)); // POST for backward compatibility

// API Routes - all require authentication via API Gateway authorizer
// Note: API Gateway validates tokens before requests reach Lambda,
// but we also check in middleware for extra safety
app.use('/auth', requireAuth, authRoutes);
app.use('/galleries', requireAuth, galleriesRoutes);
app.use('/clients', requireAuth, clientsRoutes);
app.use('/packages', requireAuth, packagesRoutes);
// Stripe payments (/payments/*) are handled by separate Lambda functions
app.use('/transactions', requireAuth, transactionsRoutes);
app.use('/wallet', requireAuth, walletRoutes);
app.use('/uploads', requireAuth, uploadsRoutes);
app.use('/downloads', requireAuth, downloadsRoutes);
app.use('/', requireAuth, ordersRoutes); // Orders routes handle their own paths (some under /galleries, some under /orders)
app.use('/galleries', requireAuth, selectionsRoutes); // Selections are under galleries path
app.use('/galleries', requireAuth, processedRoutes); // Processed routes are under galleries path
app.use('/dashboard', requireAuth, dashboardRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
	res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
	console.error('Unhandled error:', err);
	res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Export Lambda handler
export const handler = lambdaLogger(createServerlessHandler(app));

