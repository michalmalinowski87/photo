import { lambdaLogger } from '../../../packages/logger/src';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { listTransactionsByUser } from '../../lib/src/transactions';

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;

	const requester = getUserIdFromEvent(event);
	if (!requester) {
		logger?.warn('Unauthorized wallet transactions request', { 
			hasAuthorizer: !!event?.requestContext?.authorizer,
			hasJWT: !!event?.requestContext?.authorizer?.jwt 
		});
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	const limit = parseInt(event?.queryStringParameters?.limit || '50', 10);
	const limitClamped = Math.min(Math.max(limit, 1), 100);

	try {
		let transactions: any[] = [];

		// Query TRANSACTIONS_TABLE if available (preferred)
		if (transactionsTable) {
			try {
				logger?.info('Querying TRANSACTIONS_TABLE', { 
					userId: requester, 
					limit: limitClamped,
					transactionsTable 
				});
				const txnList = await listTransactionsByUser(requester, { limit: limitClamped });
				logger?.info('Transactions retrieved from TRANSACTIONS_TABLE', { 
					userId: requester, 
					count: txnList.length,
					transactions: txnList.map((tx: any) => ({
						transactionId: tx.transactionId,
						type: tx.type,
						status: tx.status,
						amountCents: tx.amountCents
					}))
				});
				
				if (txnList.length === 0) {
					logger?.warn('No transactions found in TRANSACTIONS_TABLE', { 
						userId: requester,
						transactionsTable,
						willFallbackToLedger: !!ledgerTable
					});
				}
				
				transactions = txnList.map((tx: any) => {
					// Map transaction types to display types
					let displayType = tx.type;
					if (tx.type === 'GALLERY_PLAN' || tx.type === 'ADDON_PURCHASE') {
						if (tx.paymentMethod === 'WALLET') {
							displayType = 'WALLET_DEBIT';
						} else if (tx.paymentMethod === 'STRIPE') {
							displayType = 'STRIPE_CHECKOUT';
						} else if (tx.paymentMethod === 'MIXED') {
							displayType = 'MIXED';
						}
					}
					// WALLET_TOPUP stays as WALLET_TOPUP (no mapping needed)

					return {
						transactionId: tx.transactionId,
						txnId: tx.transactionId,
						type: displayType,
						status: tx.status,
						paymentMethod: tx.paymentMethod,
						amountCents: tx.amountCents,
						walletAmountCents: tx.walletAmountCents || 0,
						stripeAmountCents: tx.stripeAmountCents || 0,
						amount: tx.amountCents / 100,
						galleryId: tx.galleryId,
						refId: tx.refId || tx.transactionId,
						stripeSessionId: tx.stripeSessionId,
						composites: tx.composites,
						createdAt: tx.createdAt,
						paidAt: tx.paidAt,
						canceledAt: tx.canceledAt
					};
				});
			} catch (err: any) {
				logger?.error('Failed to query TRANSACTIONS_TABLE, falling back to ledger', {
					error: {
						name: err.name,
						message: err.message,
						stack: err.stack
					},
					userId: requester,
					transactionsTable
				});
			}
		} else {
			logger?.warn('TRANSACTIONS_TABLE not configured, using ledger table', { userId: requester });
		}

		// Fallback to ledger table if transactions table not available or empty
		if (transactions.length === 0 && ledgerTable) {
			const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
			const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
			const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
			
			const query = await ddb.send(new QueryCommand({
				TableName: ledgerTable,
				KeyConditionExpression: 'userId = :u',
				ExpressionAttributeValues: { ':u': requester },
				ScanIndexForward: false,
				Limit: limitClamped
			}));

			transactions = (query.Items || []).map((item: any) => ({
				transactionId: item.txnId,
				txnId: item.txnId,
				type: item.type === 'TOP_UP' ? 'WALLET_TOPUP' : 'WALLET_DEBIT',
				status: 'PAID',
				paymentMethod: 'WALLET',
				amountCents: Math.abs(item.amountCents),
				walletAmountCents: Math.abs(item.amountCents),
				stripeAmountCents: 0,
				amount: Math.abs(item.amountCents) / 100,
				refId: item.refId,
				createdAt: item.createdAt
			}));
		}

		// Sort by createdAt DESC (newest first)
		transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

		logger?.info('Transactions retrieved', { userId: requester, count: transactions.length });

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				userId: requester,
				transactions,
				count: transactions.length
			})
		};
	} catch (error: any) {
		logger?.error('List transactions failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			userId: requester
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list transactions', message: error.message })
		};
	}
});

