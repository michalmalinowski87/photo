import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { createTransaction } from '../../lib/src/transactions';
import { PRICING_PLANS } from '../../lib/src/pricing';

	const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Credit welcome bonus to new users (900 cents = 1GB 3-month plan cost)
 * This is our customer acquisition cost (CAC) - allows users to try the service for free
 * 
 * SECURITY: Multiple safeguards prevent abuse:
 * 1. Checks for existing transactions before crediting
 * 2. Checks for existing WELCOME_BONUS ledger entries
 * 3. Uses conditional PutCommand for ledger entry (prevents double crediting)
 * 4. Returns 0 if any check fails (fail-safe)
 */
async function creditWelcomeBonus(
	userId: string,
	walletsTable: string,
	ledgerTable: string,
	transactionsTable: string,
	logger: any
): Promise<number> {
	const welcomeBonusCents = PRICING_PLANS['1GB-3m'].priceCents; // 900 cents (9 PLN)
	const now = new Date().toISOString();
	
	// SECURITY CHECK 1: Check if user already has any transactions (to avoid double crediting)
	try {
		const transactionsResult = await ddb.send(new QueryCommand({
			TableName: transactionsTable,
			KeyConditionExpression: 'userId = :u',
			ExpressionAttributeValues: { ':u': userId },
			Limit: 1
		}));
		
		if (transactionsResult.Items && transactionsResult.Items.length > 0) {
			logger?.info('User already has transactions, skipping welcome bonus', { userId });
			return 0;
		}
	} catch (err: any) {
		logger?.error('Failed to check existing transactions - ABORTING welcome bonus for security', {
			userId,
			error: err.message
		});
		// SECURITY: Do NOT credit if we can't verify user is new - fail safe
		return 0;
	}
	
	// SECURITY CHECK 2: Check if user already has welcome bonus in ledger
	try {
		const ledgerResult = await ddb.send(new QueryCommand({
			TableName: ledgerTable,
			KeyConditionExpression: 'userId = :u',
			FilterExpression: '#type = :type',
			ExpressionAttributeNames: { '#type': 'type' },
			ExpressionAttributeValues: {
				':u': userId,
				':type': 'WELCOME_BONUS'
			},
			Limit: 1
		}));
		
		if (ledgerResult.Items && ledgerResult.Items.length > 0) {
			logger?.info('User already received welcome bonus, skipping', { userId });
			return 0;
		}
	} catch (err: any) {
		logger?.error('Failed to check ledger for welcome bonus - ABORTING for security', {
			userId,
			error: err.message
		});
		// SECURITY: Do NOT credit if we can't verify - fail safe
		return 0;
	}
	
	// Get current wallet balance
	const walletGet = await ddb.send(new GetCommand({
		TableName: walletsTable,
		Key: { userId }
	}));
	
	const currentBalance = walletGet.Item?.balanceCents || 0;
	const newBalance = currentBalance + welcomeBonusCents;
	
	// Create transaction record FIRST (generates transactionId)
	let transactionId: string;
	try {
		transactionId = await createTransaction(userId, 'WELCOME_BONUS', welcomeBonusCents, {
			walletAmountCents: welcomeBonusCents,
			stripeAmountCents: 0,
			paymentMethod: 'WALLET',
			metadata: {
				bonusType: 'NEW_USER_WELCOME',
				planEquivalent: '1GB-3m',
				planPriceCents: welcomeBonusCents
			},
			composites: ['Welcome Bonus - 1GB 3-month plan equivalent']
		});
		
		// Mark transaction as PAID immediately (it's a bonus, not a payment)
		await ddb.send(new UpdateCommand({
			TableName: transactionsTable,
			Key: { userId, transactionId },
			UpdateExpression: 'SET #status = :status, paidAt = :paidAt, updatedAt = :updatedAt',
			ExpressionAttributeNames: { '#status': 'status' },
			ExpressionAttributeValues: {
				':status': 'PAID',
				':paidAt': now,
				':updatedAt': now
			}
		}));
	} catch (txnErr: any) {
		logger?.error('Failed to create welcome bonus transaction - ABORTING', {
			userId,
			error: txnErr.message
		});
		// SECURITY: Do NOT credit wallet if transaction creation fails
		return 0;
	}
	
	// SECURITY CHECK 3: Create ledger entry with conditional PutCommand
	// This prevents race conditions - if ledger entry already exists, this will fail
	try {
		await ddb.send(new PutCommand({
			TableName: ledgerTable,
			Item: {
				userId,
				txnId: transactionId,
				type: 'WELCOME_BONUS',
				amountCents: welcomeBonusCents,
				refId: transactionId,
				createdAt: now
			},
			// SECURITY: Conditional write - only create if this exact entry doesn't exist
			ConditionExpression: 'attribute_not_exists(txnId)'
		}));
	} catch (ledgerErr: any) {
		if (ledgerErr.name === 'ConditionalCheckFailedException') {
			logger?.warn('Welcome bonus ledger entry already exists - race condition detected, skipping', {
				userId,
				transactionId
			});
			// Rollback transaction creation (mark as CANCELED)
			try {
				await ddb.send(new UpdateCommand({
					TableName: transactionsTable,
					Key: { userId, transactionId },
					UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
					ExpressionAttributeNames: { '#status': 'status' },
					ExpressionAttributeValues: {
						':status': 'CANCELED',
						':updatedAt': now
					}
				}));
			} catch (rollbackErr: any) {
				logger?.error('Failed to rollback transaction after ledger conflict', {
					userId,
					transactionId,
					error: rollbackErr.message
				});
			}
			return 0;
		}
		logger?.error('Failed to create welcome bonus ledger entry - ABORTING', {
			userId,
			error: ledgerErr.message
		});
		// SECURITY: Rollback transaction if ledger creation fails
		try {
			await ddb.send(new UpdateCommand({
				TableName: transactionsTable,
				Key: { userId, transactionId },
				UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
				ExpressionAttributeNames: { '#status': 'status' },
				ExpressionAttributeValues: {
					':status': 'CANCELED',
					':updatedAt': now
				}
			}));
		} catch (rollbackErr: any) {
			logger?.error('Failed to rollback transaction after ledger error', {
				userId,
				transactionId,
				error: rollbackErr.message
			});
		}
		return 0;
	}
	
	// Update wallet balance atomically
	await ddb.send(new UpdateCommand({
		TableName: walletsTable,
		Key: { userId },
		UpdateExpression: 'SET balanceCents = :b, updatedAt = :u',
		ExpressionAttributeValues: {
			':b': newBalance,
			':u': now
		}
	}));
	
	logger?.info('Welcome bonus credited to new user', {
		userId,
		amountCents: welcomeBonusCents,
		newBalance,
		transactionId
	});
	
	return newBalance;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	if (!walletsTable) {
		logger?.error('Missing WALLETS_TABLE environment variable');
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing WALLETS_TABLE' })
		};
	}

	const requester = getUserIdFromEvent(event);
	if (!requester) {
		logger?.warn('Unauthorized wallet balance request', { 
			hasAuthorizer: !!event?.requestContext?.authorizer,
			hasJWT: !!event?.requestContext?.authorizer?.jwt 
		});
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;

	try {
		const wallet = await ddb.send(new GetCommand({
			TableName: walletsTable,
			Key: { userId: requester }
		}));

		// If wallet doesn't exist, create it and credit welcome bonus for new users
		if (!wallet.Item) {
			logger?.info('Creating new wallet for user', { userId: requester });
			const now = new Date().toISOString();
			
			// SECURITY: Use conditional PutCommand to prevent race conditions
			// If wallet already exists (from concurrent request), this will fail gracefully
			try {
				await ddb.send(new PutCommand({
					TableName: walletsTable,
					Item: {
						userId: requester,
						balanceCents: 0,
						currency: 'PLN',
						createdAt: now,
						updatedAt: now
					},
					// SECURITY: Only create if wallet doesn't exist (prevents race condition)
					ConditionExpression: 'attribute_not_exists(userId)'
				}));
			} catch (putErr: any) {
				if (putErr.name === 'ConditionalCheckFailedException') {
					// Wallet was created by concurrent request - fetch it and continue
					logger?.info('Wallet already exists (race condition), fetching current balance', {
						userId: requester
					});
					const existingWallet = await ddb.send(new GetCommand({
						TableName: walletsTable,
						Key: { userId: requester }
					}));
					
					if (existingWallet.Item) {
						const balanceCents = existingWallet.Item.balanceCents || 0;
						return {
							statusCode: 200,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								userId: requester,
								balanceCents,
								balance: balanceCents / 100,
								currency: existingWallet.Item.currency || 'PLN'
							})
						};
					}
				}
				// Re-throw if it's not a conditional check failure
				throw putErr;
			}
			
			// Credit welcome bonus if user is new (no existing transactions)
			let balanceCents = 0;
			if (ledgerTable && transactionsTable) {
				try {
					const creditedBalance = await creditWelcomeBonus(
						requester,
						walletsTable,
						ledgerTable,
						transactionsTable,
						logger
					);
					balanceCents = creditedBalance;
				} catch (bonusErr: any) {
					logger?.error('Failed to credit welcome bonus', {
						userId: requester,
						error: bonusErr.message
					});
					// Continue with zero balance if bonus fails (fail-safe)
					balanceCents = 0;
				}
			}
			
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					userId: requester,
					balanceCents,
					balance: balanceCents / 100,
					currency: 'PLN'
				})
			};
		}

		const balanceCents = wallet.Item.balanceCents || 0;
		const currency = wallet.Item.currency || 'PLN';

		logger?.info('Wallet balance retrieved', { userId: requester, balanceCents });

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				userId: requester,
				balanceCents,
				balance: balanceCents / 100,
				currency
			})
		};
	} catch (error: any) {
		logger?.error('Get balance failed', {
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
			body: JSON.stringify({ error: 'Failed to get balance', message: error.message })
		};
	}
});

