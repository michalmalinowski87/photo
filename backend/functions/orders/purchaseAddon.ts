import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { hasAddon, createBackupStorageAddon, ADDON_TYPES } from '../../lib/src/addons';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

async function debitWallet(userId: string, amountCents: number, walletsTable: string, ledgerTable: string, logger: any): Promise<boolean> {
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
		const txnId = `debit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
					txnId,
					type: 'DEBIT',
					amountCents: -amountCents,
					refId: txnId,
					createdAt: now
				}
			}));

			logger.info('Wallet debit successful', { userId, amountCents, oldBalance: currentBalance, newBalance, txnId });
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

	// Check if gallery already has backup addon
	const addonExists = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
	if (addonExists) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Backup storage addon already purchased for this gallery' })
		};
	}

	// Get all orders for the gallery to calculate total addon price
	const ordersQuery = await ddb.send(new QueryCommand({
		TableName: ordersTable,
		KeyConditionExpression: 'galleryId = :g',
		ExpressionAttributeValues: { ':g': galleryId }
	}));
	const orders = ordersQuery.Items || [];
	
	// Calculate addon price based on average order value or use a base calculation
	const BACKUP_STORAGE_MULTIPLIER = 0.3; // Default 30%, will be configurable through UI in future
	const pkg = gallery.pricingPackage as { includedCount?: number; extraPriceCents?: number } | undefined;
	const estimatedOrderValue = pkg?.extraPriceCents ? (pkg.extraPriceCents * 10) : 10000; // Default to 100 PLN if no package
	const backupStorageCents = Math.round(estimatedOrderValue * BACKUP_STORAGE_MULTIPLIER);

	// Try wallet debit first if enabled
	let paid = false;
	let checkoutUrl: string | undefined;

	if (walletsTable && ledgerTable) {
		paid = await debitWallet(requester, backupStorageCents, walletsTable, ledgerTable, logger);
		logger.info('Wallet debit attempt for addon purchase', { 
			userId: requester, 
			amountCents: backupStorageCents, 
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

	// If wallet debit failed and Stripe is configured, create checkout session
	if (!paid && stripeSecretKey) {
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
					redirectUrl: redirectUrl
				}
			});

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
				message: 'Insufficient wallet balance. Please complete payment via Stripe checkout.'
			})
		};
	} else {
		// No payment method available
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Insufficient wallet balance and Stripe not configured. Please top up your wallet or configure Stripe.' 
			})
		};
	}
});

