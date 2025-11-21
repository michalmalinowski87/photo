import { lambdaLogger } from '../../../packages/logger/src';
import { getTransaction, updateTransactionStatus, listTransactionsByUser } from '../../lib/src/transactions';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	
	// Try to get transactionId from query parameters
	const transactionId = event?.queryStringParameters?.transactionId;
	const userId = event?.queryStringParameters?.userId;
	const sessionId = event?.queryStringParameters?.session_id;
	
	// If we have session_id, try to get transaction from Stripe session metadata
	if (sessionId && stripeSecretKey && !transactionId) {
		try {
			const stripe = new Stripe(stripeSecretKey);
			const session = await stripe.checkout.sessions.retrieve(sessionId);
			const metadataTransactionId = session.metadata?.transactionId;
			const metadataUserId = session.metadata?.userId;
			const metadataType = session.metadata?.type;
			
			if (metadataTransactionId && metadataUserId) {
				// Mark transaction as CANCELED
				const transaction = await getTransaction(metadataUserId, metadataTransactionId);
				if (transaction && transaction.status === 'UNPAID') {
					await updateTransactionStatus(metadataUserId, metadataTransactionId, 'CANCELED');
					logger?.info('Transaction marked as CANCELED (user clicked back)', { 
						transactionId: metadataTransactionId, 
						userId: metadataUserId,
						type: metadataType,
						sessionId
					});
				}
				
				// Redirect based on transaction type
				const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
				const redirectUrl = metadataType === 'wallet_topup'
					? `${dashboardUrl}/wallet?payment=cancelled`
					: `${dashboardUrl}/galleries?payment=cancelled`;
				
				return {
					statusCode: 302,
					headers: {
						Location: redirectUrl
					},
					body: ''
				};
			}
		} catch (stripeErr: any) {
			logger?.warn('Failed to retrieve Stripe session for cancel', {
				error: stripeErr.message,
				sessionId
			});
		}
	}
	
	// Fallback: If we have transaction info directly, mark it as CANCELED
	let transactionType: string | undefined;
	if (transactionId && userId) {
		try {
			const transaction = await getTransaction(userId, transactionId);
			if (transaction && transaction.status === 'UNPAID') {
				await updateTransactionStatus(userId, transactionId, 'CANCELED');
				transactionType = transaction.type;
				logger?.info('Transaction marked as CANCELED (user clicked back)', { transactionId, userId, type: transactionType });
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
	
	// Redirect based on transaction type (wallet_topup goes to /wallet, others to /galleries)
	const redirectUrl = transactionType === 'WALLET_TOPUP'
		? `${dashboardUrl}/wallet?payment=cancelled`
		: `${dashboardUrl}/galleries?payment=cancelled`;

	return {
		statusCode: 302,
		headers: {
			Location: redirectUrl
		},
		body: ''
	};
});

