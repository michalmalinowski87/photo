import { Router, Request, Response } from 'express';
import { getStripePaymentMethods } from '../../../lib/src/stripe-config';
import { getCompanyConfig } from '../../../lib/src/company-config';

const router = Router();

const DEFAULT_COMPANY = {
	company_name: 'TBA',
	company_tax_id: 'TBA',
	company_address: 'TBA',
	company_email: 'TBA',
	legal_document_publication_date: '02.02.2026',
};

/**
 * GET /config
 * Returns application configuration including payment methods and company/legal data
 * Public endpoint (no auth required) - can be protected if needed
 */
router.get('/config', async (req: Request, res: Response) => {
	const logger = (req as any).logger;
	
	try {
		const [paymentMethods, company] = await Promise.all([
			getStripePaymentMethods(),
			getCompanyConfig(),
		]);
		
		const config = {
			paymentMethods,
			company,
			version: '1.0',
		};
		
		return res.json(config);
	} catch (error: any) {
		logger?.error('Failed to get config', {
			error: { name: error.name, message: error.message }
		});
		
		// Return default config on error (graceful degradation)
		return res.json({
			paymentMethods: ['card', 'blik', 'p24'],
			company: DEFAULT_COMPANY,
			version: '1.0',
		});
	}
});

export { router as configRoutes };
