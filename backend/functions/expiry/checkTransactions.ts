import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { listTransactionsByUser, updateTransactionStatus } from '../../lib/src/transactions';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const galleriesDeleteFnName = envProc?.env?.GALLERIES_DELETE_FN_NAME as string;

	if (!transactionsTable) {
		logger?.error('TRANSACTIONS_TABLE not configured');
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'TRANSACTIONS_TABLE not configured' })
		};
	}

	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - 3); // 3 days ago for gallery transactions
	const cutoffDateISO = cutoffDate.toISOString();
	
	// 15 minutes ago for wallet top-ups
	const walletTopupCutoffDate = new Date();
	walletTopupCutoffDate.setMinutes(walletTopupCutoffDate.getMinutes() - 15);
	const walletTopupCutoffDateISO = walletTopupCutoffDate.toISOString();

	try {
		let expiredCount = 0;
		let deletedGalleriesCount = 0;
		let expiredWalletTopupsCount = 0;

		// Query galleries with DRAFT state older than 3 days
		// Then check if they have unpaid transactions
		if (galleriesTable) {
			// Use GSI to efficiently query DRAFT galleries older than 3 days
			let lastEvaluatedKey: any = undefined;
			do {
				const queryResult = await ddb.send(new QueryCommand({
					TableName: galleriesTable,
					IndexName: 'state-createdAt-index',
					KeyConditionExpression: '#state = :s AND createdAt < :cutoff',
					ExpressionAttributeValues: {
						':s': 'DRAFT',
						':cutoff': cutoffDateISO
					},
					ExpressionAttributeNames: {
						'#state': 'state'
					},
					ExclusiveStartKey: lastEvaluatedKey,
					Limit: 100
				}));

				const draftGalleries = queryResult.Items || [];
				
				for (const gallery of draftGalleries) {
					const galleryId = gallery.galleryId;
					const ownerId = gallery.ownerId;
					
					// Check if gallery has unpaid transaction
					try {
						const unpaidTransactions = await listTransactionsByUser(ownerId, {
							type: 'GALLERY_PLAN',
							status: 'UNPAID'
						});
						
						const unpaidTx = unpaidTransactions.find((tx: any) => 
							tx.galleryId === galleryId && 
							new Date(tx.createdAt) < cutoffDate
						);
						
						if (unpaidTx) {
							// Cancel transaction
							await updateTransactionStatus(ownerId, unpaidTx.transactionId, 'CANCELED');
							expiredCount++;
							
							// Delete gallery
							if (galleriesDeleteFnName) {
								try {
									const payload = Buffer.from(JSON.stringify({
										pathParameters: { id: galleryId },
										requestContext: {
											authorizer: {
												jwt: {
													claims: {
														sub: ownerId
													}
												}
											}
										}
									}));
									await lambda.send(new InvokeCommand({
										FunctionName: galleriesDeleteFnName,
										Payload: payload,
										InvocationType: 'RequestResponse'
									}));
									deletedGalleriesCount++;
									logger?.info('Gallery deleted after transaction expiry', {
										galleryId,
										transactionId: unpaidTx.transactionId,
										ownerId
									});
								} catch (deleteErr: any) {
									logger?.error('Failed to delete gallery after transaction expiry', {
										error: deleteErr.message,
										galleryId
									});
								}
							} else {
								// Fallback: delete directly
								await ddb.send(new DeleteCommand({
									TableName: galleriesTable,
									Key: { galleryId }
								}));
								deletedGalleriesCount++;
							}
						}
					} catch (txnErr: any) {
						logger?.warn('Failed to check transactions for gallery', {
							error: txnErr.message,
							galleryId
						});
					}
				}
				
				lastEvaluatedKey = scanResult.LastEvaluatedKey;
			} while (lastEvaluatedKey);
		}

		// Check for expired wallet top-up transactions (15 minutes)
		if (transactionsTable) {
			try {
				// Use GSI to efficiently query UNPAID transactions older than 15 minutes
				// Then filter by type in memory (or use FilterExpression)
				let lastEvaluatedKey: any = undefined;
				do {
					const queryParams: any = {
						TableName: transactionsTable,
						IndexName: 'status-createdAt-index',
						KeyConditionExpression: '#status = :status AND createdAt < :cutoff',
						FilterExpression: '#type = :type',
						ExpressionAttributeNames: {
							'#status': 'status',
							'#type': 'type'
						},
						ExpressionAttributeValues: {
							':status': 'UNPAID',
							':cutoff': walletTopupCutoffDateISO,
							':type': 'WALLET_TOPUP'
						}
					};
					if (lastEvaluatedKey) {
						queryParams.ExclusiveStartKey = lastEvaluatedKey;
					}
					
					const queryResult = await ddb.send(new QueryCommand(queryParams));
					const unpaidTopups = queryResult.Items || [];
					
					for (const tx of unpaidTopups) {
						// All transactions in result are already older than cutoff, so process them all
						// Cancel expired wallet top-up transaction
						await updateTransactionStatus(tx.userId, tx.transactionId, 'CANCELED');
						expiredWalletTopupsCount++;
						const createdAt = new Date(tx.createdAt);
						logger?.info('Wallet top-up transaction expired and canceled', {
							transactionId: tx.transactionId,
							userId: tx.userId,
							createdAt: tx.createdAt,
							ageMinutes: Math.round((Date.now() - createdAt.getTime()) / 60000)
						});
					}
					
					lastEvaluatedKey = queryResult.LastEvaluatedKey;
				} while (lastEvaluatedKey);
			} catch (topupErr: any) {
				logger?.error('Failed to check wallet top-up transactions expiry', {
					error: topupErr.message
				});
			}
		}

		logger?.info('Transaction expiry check completed', {
			expiredCount,
			deletedGalleriesCount,
			expiredWalletTopupsCount
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				expiredCount,
				deletedGalleriesCount,
				expiredWalletTopupsCount,
				message: 'Transaction expiry check completed'
			})
		};
	} catch (error: any) {
		logger?.error('Transaction expiry check failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			}
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Transaction expiry check failed', message: error.message })
		};
	}
});

