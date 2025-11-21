import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { hasAddon, createBackupStorageAddon, ADDON_TYPES } from '../../lib/src/addons';
import { createTransaction, updateTransactionStatus } from '../../lib/src/transactions';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

async function getWalletBalance(userId: string, walletsTable: string, logger: any): Promise<number> {
	try {
		const walletGet = await ddb.send(new GetCommand({
			TableName: walletsTable,
			Key: { userId }
		}));
		return walletGet.Item?.balanceCents || 0;
	} catch (error) {
		return 0;
	}
}

async function debitWallet(userId: string, amountCents: number, walletsTable: string, ledgerTable: string, transactionId: string, logger: any): Promise<boolean> {
	const now = new Date().toISOString();
	
	try {
		// Get current balance
		const walletGet = await ddb.send(new GetCommand({
			TableName: walletsTable,
			Key: { userId }
		}));
		
		// If wallet doesn't exist, create it with balance 0 first
		if (!walletGet.Item) {
			logger.info('Wallet does not exist, creating with zero balance', { userId });
			await ddb.send(new PutCommand({
				TableName: walletsTable,
				Item: {
					userId,
					balanceCents: 0,
					currency: 'PLN',
					createdAt: now,
					updatedAt: now
				}
			}));
			logger.info('Wallet created with zero balance', { userId });
			return false; // Insufficient balance (0)
		}
		
		const currentBalance = walletGet.Item.balanceCents || 0;
		logger.info('Wallet balance check', { userId, currentBalance, amountCents, sufficient: currentBalance >= amountCents });
		
		if (currentBalance < amountCents) {
			return false; // Insufficient balance
		}

		const newBalance = currentBalance - amountCents;

		// Atomic update with condition
		try {
			await ddb.send(new UpdateCommand({
				TableName: walletsTable,
				Key: { userId },
				UpdateExpression: 'SET balanceCents = :b, updatedAt = :u',
				ConditionExpression: 'attribute_exists(userId) AND balanceCents >= :amount',
				ExpressionAttributeValues: {
					':b': newBalance,
					':amount': amountCents,
					':u': now
				}
			}));

			// Create ledger entry
			await ddb.send(new PutCommand({
				TableName: ledgerTable,
				Item: {
					userId,
					txnId: transactionId,
					type: 'DEBIT',
					amountCents: -amountCents,
					refId: transactionId,
					createdAt: now
				}
			}));

			logger.info('Wallet debit successful', { userId, amountCents, oldBalance: currentBalance, newBalance, transactionId });
			return true;
		} catch (err: any) {
			if (err.name === 'ConditionalCheckFailedException') {
				logger.warn('Wallet debit failed - conditional check failed (balance changed or insufficient)', { 
					userId, 
					amountCents,
					error: err.message 
				});
				return false; // Balance changed, insufficient
			}
			logger.error('Wallet debit failed with error', { userId, amountCents, error: err.message });
			throw err;
		}
	} catch (error: any) {
		logger.error('Wallet debit failed', { 
			userId, 
			amountCents,
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			}
		});
		return false;
	}
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const apiUrl = envProc?.env?.PUBLIC_API_URL as string || '';
	const generateZipsFnName = envProc?.env?.GENERATE_ZIPS_FOR_ADDON_FN_NAME as string;
	
	if (!galleriesTable || !ordersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	
	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId' })
		};
	}

	const requester = getUserIdFromEvent(event);
	if (!requester) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	// Verify gallery ownership
	const galleryGet = await ddb.send(new GetCommand({
		TableName: galleriesTable,
		Key: { galleryId }
	}));
	const gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}
	requireOwnerOr403(gallery.ownerId, requester);

	// Backup addon is only available for galleries with selection enabled
	if (!gallery.selectionEnabled) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Backup storage addon is only available for galleries with client selection enabled' })
		};
	}

	// Check if gallery already has backup addon
	const addonExists = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
	if (addonExists) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Backup storage addon already purchased for this gallery' })
		};
	}

	// Get all orders for the gallery to calculate total addon price and check for processed orders
	const ordersQuery = await ddb.send(new QueryCommand({
		TableName: ordersTable,
		KeyConditionExpression: 'galleryId = :g',
		ExpressionAttributeValues: { ':g': galleryId }
	}));
	const orders = ordersQuery.Items || [];
	
	// Check if any orders are DELIVERED or PREPARING_DELIVERY (originals may have been deleted)
	const processedOrders = orders.filter((o: any) => 
		o.deliveryStatus === 'DELIVERED' || o.deliveryStatus === 'PREPARING_DELIVERY'
	);
	
	if (processedOrders.length > 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Cannot purchase backup addon',
				warning: `This gallery has ${processedOrders.length} order(s) that are already processed (DELIVERED or PREPARING_DELIVERY). Original photos for these orders may have been deleted and cannot be recovered. Backup addon can only protect future orders.`,
				processedOrdersCount: processedOrders.length
			})
		};
	}
	
	// Calculate addon price based on photographer's plan price (30% of plan price)
	// This makes more sense than basing it on client pricing (extra photos)
	const BACKUP_STORAGE_MULTIPLIER = 0.3; // Default 30%, will be configurable through UI in future
	const planPriceCents = gallery.priceCents || 700; // Default to Basic plan price (7 PLN) if not set
	const backupStorageCents = Math.round(planPriceCents * BACKUP_STORAGE_MULTIPLIER);

	// Try wallet debit first if enabled - only debit if wallet has sufficient balance for full amount
	let paid = false;
	let walletAmountCents = 0;
	let stripeAmountCents = backupStorageCents; // Default to full Stripe payment
	let checkoutUrl: string | undefined;

	if (walletsTable && ledgerTable) {
		const walletBalance = await getWalletBalance(requester, walletsTable, logger);
		
		// Only debit wallet if balance is sufficient to cover full cost
		if (walletBalance >= backupStorageCents) {
			paid = await debitWallet(requester, backupStorageCents, walletsTable, ledgerTable, `debit_${Date.now()}`, logger);
			if (paid) {
				walletAmountCents = backupStorageCents;
				stripeAmountCents = 0;
			}
		}
		// If insufficient balance, don't debit wallet - redirect to Stripe for full amount
		
		logger.info('Wallet debit attempt for addon purchase', { 
			userId: requester, 
			amountCents: backupStorageCents,
			walletBalance,
			walletAmountCents,
			stripeAmountCents,
			paid, 
			hasWalletsTable: !!walletsTable, 
			hasLedgerTable: !!ledgerTable 
		});
	} else {
		logger.warn('Wallet tables not configured, skipping wallet debit', {
			hasWalletsTable: !!walletsTable,
			hasLedgerTable: !!ledgerTable
		});
	}

	// Create transaction immediately
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	let transactionId: string | undefined;
	
		if (transactionsTable) {
		try {
			// Determine payment method: STRIPE if any Stripe amount, otherwise WALLET if wallet was used
			const paymentMethod = stripeAmountCents > 0 ? 'STRIPE' : (walletAmountCents > 0 ? 'WALLET' : 'STRIPE');
			
			// Build composites list for frontend display
			const composites: string[] = ['Backup addon'];
			
			transactionId = await createTransaction(
				requester,
				'ADDON_PURCHASE',
				backupStorageCents,
				{
					galleryId,
					walletAmountCents,
					stripeAmountCents,
					paymentMethod: paymentMethod as any,
					composites,
					metadata: {
						addonType: ADDON_TYPES.BACKUP_STORAGE,
						multiplier: BACKUP_STORAGE_MULTIPLIER
					}
				}
			);
			logger.info('Transaction created for addon purchase', { transactionId, galleryId, backupStorageCents, walletAmountCents, stripeAmountCents });
			
			// If fully paid with wallet, update transaction status immediately
			if (paid && stripeAmountCents === 0) {
				await updateTransactionStatus(requester, transactionId, 'PAID');
			}
		} catch (err: any) {
			logger.error('Failed to create transaction for addon purchase', {
				error: err.message,
				galleryId
			});
		}
	}

	// If not fully paid (stripeAmountCents > 0) and Stripe is configured, create checkout for full amount
	if (stripeAmountCents > 0 && stripeSecretKey) {
		try {
			const stripe = new Stripe(stripeSecretKey);
			const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
			const redirectUrl = `${dashboardUrl}/galleries?addon=success&gallery=${galleryId}`;
			
			const successUrl = apiUrl 
				? `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`
				: 'https://your-frontend/payments/success?session_id={CHECKOUT_SESSION_ID}';
			const cancelUrl = apiUrl
				? `${apiUrl}/payments/cancel`
				: 'https://your-frontend/payments/cancel';

			const session = await stripe.checkout.sessions.create({
				payment_method_types: ['card'],
				mode: 'payment',
				line_items: [
					{
						price_data: {
							currency: 'pln',
							product_data: {
								name: 'Backup Storage Addon',
								description: `Backup storage addon for gallery ${galleryId}`
							},
							unit_amount: backupStorageCents
						},
						quantity: 1
					}
				],
				success_url: successUrl,
				cancel_url: cancelUrl,
				metadata: {
					userId: requester,
					type: 'addon_payment',
					galleryId,
					transactionId: transactionId || '',
					walletAmountCents: walletAmountCents.toString(),
					stripeAmountCents: stripeAmountCents.toString(),
					redirectUrl: redirectUrl
				}
			});

			// Update transaction with Stripe session ID
			if (transactionId && transactionsTable) {
				await updateTransactionStatus(requester, transactionId, 'UNPAID', {
					stripeSessionId: session.id
				});
			}

			checkoutUrl = session.url;
			logger.info('Stripe checkout session created for addon purchase', { 
				checkoutUrl, 
				sessionId: session.id, 
				galleryId 
			});
		} catch (err: any) {
			logger.error('Stripe checkout creation failed for addon purchase', {
				error: {
					name: err.name,
					message: err.message,
					code: err.code,
					type: err.type
				},
				galleryId
			});
		}
	}

	// If payment succeeded (wallet debit), create addon and generate ZIPs immediately
	if (paid) {
	try {
		await createBackupStorageAddon(galleryId, backupStorageCents, BACKUP_STORAGE_MULTIPLIER);
			logger.info('Backup storage addon purchased for gallery (wallet)', { 
				galleryId, 
				backupStorageCents, 
				multiplier: BACKUP_STORAGE_MULTIPLIER 
			});
	} catch (err: any) {
		logger.error('Failed to create backup storage addon', {
			error: err.message,
			galleryId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to create addon', message: err.message })
		};
	}

		// Trigger ZIP generation Lambda asynchronously (fire and forget)
		if (generateZipsFnName) {
				try {
				const payload = Buffer.from(JSON.stringify({ galleryId }));
				await lambda.send(new InvokeCommand({ 
					FunctionName: generateZipsFnName, 
						Payload: payload, 
					InvocationType: 'Event' // Asynchronous invocation
				}));
				logger.info('Triggered ZIP generation Lambda for addon purchase', { 
								galleryId,
					generateZipsFnName 
				});
			} catch (invokeErr: any) {
				logger.error('Failed to invoke ZIP generation Lambda', {
					error: invokeErr.message,
									galleryId,
					generateZipsFnName
				});
				// Don't fail - addon is created, ZIPs can be generated later manually
			}
		} else {
			logger.warn('GENERATE_ZIPS_FOR_ADDON_FN_NAME not configured, ZIPs will not be generated automatically', { galleryId });
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			galleryId,
			backupStorageCents,
			transactionId,
			message: 'Backup storage addon purchased successfully for gallery. ZIPs will be generated automatically.'
		})
	};
	} else if (checkoutUrl) {
		// Return checkout URL for Stripe payment
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				checkoutUrl,
				galleryId,
				backupStorageCents,
				transactionId,
				walletAmountCents,
				stripeAmountCents,
				message: 'Please complete payment via Stripe checkout.'
			})
		};
	} else {
		// No payment method available
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Insufficient wallet balance and Stripe not configured. Please top up your wallet or configure Stripe.',
				transactionId
			})
		};
	}
});

