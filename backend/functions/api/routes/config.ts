import { Router, Request, Response } from 'express';
import { getStripePaymentMethods } from '../../../lib/src/stripe-config';

const router = Router();

/**
 * GET /config
 * Returns application configuration including payment methods
 * Public endpoint (no auth required) - can be protected if needed
 */
router.get('/config', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	
	try {
		// Get payment methods from SSM (with caching)
		const paymentMethods = await getStripePaymentMethods();
		
		const config = {
			paymentMethods,
			version: '1.0'
		};
		
		return res.json(config);
	} catch (error: any) {
		logger?.error('Failed to get config', {
			error: { name: error.name, message: error.message }
		});
		
		// Return default config on error (graceful degradation)
		return res.json({
			paymentMethods: ['card', 'blik', 'p24'],
			version: '1.0'
		});
	}
});

export { router as configRoutes };
