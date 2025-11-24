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

	const limit = parseInt(event?.queryStringParameters?.limit || '10', 10);
	const limitClamped = Math.min(Math.max(limit, 1), 100);
	const lastKeyParam = event?.queryStringParameters?.lastKey;
	let exclusiveStartKey: Record<string, any> | undefined;
	if (lastKeyParam) {
		try {
			// Handle potential double-encoding: try decoding multiple times if needed
			let decoded = lastKeyParam;
			let previousDecoded = '';
			// Decode until no more changes occur (handles double/triple encoding)
			while (decoded !== previousDecoded) {
				previousDecoded = decoded;
				try {
					const nextDecoded = decodeURIComponent(decoded);
					if (nextDecoded !== decoded) {
						decoded = nextDecoded;
					} else {
						break;
					}
				} catch (e) {
					// If decodeURIComponent fails, we've decoded as much as we can
					break;
				}
			}
			exclusiveStartKey = JSON.parse(decoded);
		} catch (e) {
			logger?.warn('Failed to parse lastKey parameter', { 
				lastKey: lastKeyParam,
				error: e instanceof Error ? e.message : String(e)
			});
		}
	}

	try {
		let transactions: any[] = [];
		let lastKey: Record<string, any> | undefined;
		let hasMore = false;

		// Query TRANSACTIONS_TABLE if available (preferred)
		if (transactionsTable) {
			try {
				logger?.info('Querying TRANSACTIONS_TABLE', { 
					userId: requester, 
					limit: limitClamped,
					hasExclusiveStartKey: !!exclusiveStartKey,
					transactionsTable 
				});
				const result = await listTransactionsByUser(requester, { 
					limit: limitClamped,
					exclusiveStartKey 
				});
				logger?.info('Transactions retrieved from TRANSACTIONS_TABLE', { 
					userId: requester, 
					count: result.transactions.length,
					hasMore: result.hasMore,
					transactions: result.transactions.map((tx: any) => ({
						transactionId: tx.transactionId,
						type: tx.type,
						status: tx.status,
						amountCents: tx.amountCents
					}))
				});
				
				if (result.transactions.length === 0) {
					logger?.warn('No transactions found in TRANSACTIONS_TABLE', { 
						userId: requester,
						transactionsTable,
						willFallbackToLedger: !!ledgerTable
					});
				}
				
				transactions = result.transactions.map((tx: any) => {
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
				lastKey = result.lastKey;
				hasMore = result.hasMore;
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
			
			const queryParams: any = {
				TableName: ledgerTable,
				KeyConditionExpression: 'userId = :u',
				ExpressionAttributeValues: { ':u': requester },
				ScanIndexForward: false,
				Limit: limitClamped + 1 // Fetch one extra to check if there are more
			};

			if (exclusiveStartKey) {
				queryParams.ExclusiveStartKey = exclusiveStartKey;
			}

			const query = await ddb.send(new QueryCommand(queryParams));
			const items = query.Items || [];
			
			hasMore = items.length > limitClamped;
			const ledgerItems = hasMore ? items.slice(0, -1) : items;
			lastKey = query.LastEvaluatedKey;

			transactions = ledgerItems.map((item: any) => ({
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

		// Sort by createdAt DESC (newest first) - only if we didn't get sorted results from DB
		if (transactions.length > 0 && transactions[0].createdAt) {
			transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		}

		logger?.info('Transactions retrieved', { userId: requester, count: transactions.length, hasMore });

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				userId: requester,
				transactions,
				count: transactions.length,
				hasMore,
				lastKey: lastKey ? encodeURIComponent(JSON.stringify(lastKey)) : null
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

