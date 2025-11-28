import { lambdaLogger } from '../../../packages/logger/src';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { getTransaction } from '../../lib/src/transactions';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Check payment processing status by session ID
 * Returns whether the payment has been processed by EventBridge
 */
// Security: Validate Stripe session ID format
function validateStripeSessionId(sessionId: string): boolean {
	if (!sessionId || typeof sessionId !== 'string') return false;
	// Stripe session ID format: cs_test_... or cs_live_...
	const stripeSessionPattern = /^cs_(test|live)_[a-zA-Z0-9]+$/;
	if (!stripeSessionPattern.test(sessionId)) return false;
	// Additional length check (Stripe session IDs are typically 50-100 chars)
	if (sessionId.length < 20 || sessionId.length > 200) return false;
	return true;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const sessionId = event?.queryStringParameters?.session_id;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const paymentsTable = envProc?.env?.PAYMENTS_TABLE as string;

	// Security: Validate session_id format
	if (!sessionId || !validateStripeSessionId(sessionId)) {
		logger?.warn('Invalid session_id format', { sessionId: sessionId?.substring(0, 10) + '...' });
		return {
			statusCode: 400,
			headers: { 
				'content-type': 'application/json',
				'X-Content-Type-Options': 'nosniff',
				'X-Frame-Options': 'DENY',
				'X-XSS-Protection': '1; mode=block'
			},
			body: JSON.stringify({ error: 'Invalid session_id parameter' })
		};
	}

	try {
		// Check if payment has been processed (EventBridge webhook)
		let isProcessed = false;
		let paymentStatus = 'pending';
		let transactionStatus: string | null = null;
		let paymentType: string | null = null;

		if (paymentsTable) {
			const paymentId = `pay_${sessionId}`;
			const paymentResult = await ddb.send(new GetCommand({
				TableName: paymentsTable,
				Key: { paymentId }
			}));

			if (paymentResult.Item) {
				isProcessed = paymentResult.Item.status === 'COMPLETED';
				paymentStatus = paymentResult.Item.status?.toLowerCase() || 'pending';
				paymentType = paymentResult.Item.type || null;
			}
		}

		// Also check transaction status if we can get session metadata
		if (stripeSecretKey && !isProcessed) {
			try {
				const stripe = new Stripe(stripeSecretKey);
				const session = await stripe.checkout.sessions.retrieve(sessionId);
				const transactionId = session.metadata?.transactionId;
				const userId = session.metadata?.userId;

				if (transactionId && userId) {
					try {
						const transaction = await getTransaction(userId, transactionId);
						if (transaction) {
							transactionStatus = transaction.status;
							// If transaction is PAID, payment is processed
							if (transaction.status === 'PAID') {
								isProcessed = true;
								paymentStatus = 'completed';
							} else if (transaction.status === 'CANCELED' || transaction.status === 'FAILED') {
								paymentStatus = transaction.status.toLowerCase();
							}
						}
					} catch (txnErr) {
						logger?.warn('Failed to get transaction status', {
							error: txnErr,
							transactionId,
							userId
						});
					}
				}

				// Fallback: check Stripe session status
				if (!isProcessed && session.payment_status === 'paid' && session.status === 'complete') {
					// Payment is confirmed by Stripe, but not yet processed by EventBridge
					// This is expected during the async processing window
					paymentStatus = 'processing';
				}
			} catch (stripeErr: any) {
				logger?.warn('Failed to retrieve Stripe session for status check', {
					error: stripeErr.message,
					sessionId
				});
			}
		}

		return {
			statusCode: 200,
			headers: { 
				'content-type': 'application/json',
				'X-Content-Type-Options': 'nosniff',
				'X-Frame-Options': 'DENY',
				'X-XSS-Protection': '1; mode=block',
				'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
			},
			body: JSON.stringify({
				sessionId,
				isProcessed,
				paymentStatus, // 'pending', 'processing', 'completed', 'canceled', 'failed'
				transactionStatus,
				paymentType
			})
		};
	} catch (error: any) {
		logger?.error('Payment status check failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			sessionId
		});

		return {
			statusCode: 500,
			headers: { 
				'content-type': 'application/json',
				'X-Content-Type-Options': 'nosniff',
				'X-Frame-Options': 'DENY',
				'X-XSS-Protection': '1; mode=block'
			},
			body: JSON.stringify({ error: 'Failed to check payment status' })
		};
	}
});

