import { lambdaLogger } from '../../../packages/logger/src';
import { getTransaction, updateTransactionStatus } from '../../lib/src/transactions';

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	
	// Try to get transactionId from query parameters or referer
	const transactionId = event?.queryStringParameters?.transactionId;
	const userId = event?.queryStringParameters?.userId;
	
	// If we have transaction info, mark it as CANCELED
	if (transactionId && userId) {
		try {
			const transaction = await getTransaction(userId, transactionId);
			if (transaction && transaction.status === 'UNPAID') {
				await updateTransactionStatus(userId, transactionId, 'CANCELED');
				logger?.info('Transaction marked as CANCELED (user clicked back)', { transactionId, userId });
			}
		} catch (err: any) {
			logger?.error('Failed to update transaction status on cancel', {
				error: err.message,
				transactionId,
				userId
			});
		}
	}
	
	// Get dashboard URL from environment - prioritize dashboard-specific env var
	// PUBLIC_GALLERY_URL is for the client gallery frontend, not the dashboard
	const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
	
	// Redirect to dashboard galleries page with cancel message
	const redirectUrl = `${dashboardUrl}/galleries?payment=cancelled`;

	return {
		statusCode: 302,
		headers: {
			Location: redirectUrl
		},
		body: ''
	};
});

