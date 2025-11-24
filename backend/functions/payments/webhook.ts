import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { createBackupStorageAddon, ADDON_TYPES } from '../../lib/src/addons';
import { getTransaction, updateTransactionStatus } from '../../lib/src/transactions';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

async function creditWallet(userId: string, amountCents: number, txnId: string, walletsTable: string, ledgerTable: string) {
	const now = new Date().toISOString();
	
	// Get current wallet balance
	const walletGet = await ddb.send(new GetCommand({
		TableName: walletsTable,
		Key: { userId }
	}));
	
	const currentBalance = walletGet.Item?.balanceCents || 0;
	const newBalance = currentBalance + amountCents;

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

	// Create ledger entry
	await ddb.send(new PutCommand({
		TableName: ledgerTable,
		Item: {
			userId,
			txnId,
			type: 'TOP_UP',
			amountCents,
			refId: txnId,
			createdAt: now
		}
	}));

	return newBalance;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const stripeWebhookSecret = envProc?.env?.STRIPE_WEBHOOK_SECRET as string;
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
	const paymentsTable = envProc?.env?.PAYMENTS_TABLE as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;

	if (!stripeSecretKey || !walletsTable || !ledgerTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing configuration' })
		};
	}

	if (!galleriesTable) {
		logger.warn('GALLERIES_TABLE not configured, gallery payment updates will be skipped');
	}

	const stripe = new Stripe(stripeSecretKey);
	const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

	if (!sig) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing signature' })
		};
	}

	let stripeEvent;
	try {
		const body = event.body;
		stripeEvent = stripe.webhooks.constructEvent(body, sig, stripeWebhookSecret);
	} catch (err: any) {
		console.error('Webhook signature verification failed:', err.message);
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Invalid signature' })
		};
	}

	try {
		if (stripeEvent.type === 'checkout.session.completed') {
			const session = stripeEvent.data.object;
			const userId = session.metadata?.userId;
			const type = session.metadata?.type || 'wallet_topup';
			const galleryId = session.metadata?.galleryId;
			const transactionId = session.metadata?.transactionId;
			const amountCents = session.amount_total;
			const paymentId = `pay_${session.id}`;

			// Check for duplicate processing
			if (paymentsTable) {
				const existing = await ddb.send(new GetCommand({
					TableName: paymentsTable,
					Key: { paymentId }
				}));
				if (existing.Item) {
					logger.info('Payment already processed', { paymentId });
					return { statusCode: 200, body: JSON.stringify({ received: true }) };
				}
			}

			// Update transaction status if transactionId is provided
			if (transactionId && userId) {
				try {
					const transaction = await getTransaction(userId, transactionId);
					if (transaction && transaction.status === 'UNPAID') {
						await updateTransactionStatus(userId, transactionId, 'PAID', {
							stripeSessionId: session.id,
							stripePaymentIntentId: session.payment_intent as string
						});
						logger.info('Transaction status updated to PAID', { transactionId, userId, sessionId: session.id });
					}
				} catch (txnErr: any) {
					logger.error('Failed to update transaction status', {
						error: txnErr.message,
						transactionId,
						userId
					});
				}
			}

			if (type === 'wallet_topup' && userId) {
				// Credit wallet
				const newBalance = await creditWallet(userId, amountCents, paymentId, walletsTable, ledgerTable);
				logger.info('Wallet credited', { userId, amountCents, newBalance, paymentId });
				
				// Update existing transaction for wallet top-up (created when checkout session was created)
				const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
				const transactionId = session.metadata?.transactionId;
				if (transactionsTable && transactionId) {
					try {
						const { updateTransactionStatus } = require('../../lib/src/transactions');
						await updateTransactionStatus(userId, transactionId, 'PAID', {
							stripeSessionId: session.id,
							stripePaymentIntentId: session.payment_intent as string
						});
						logger.info('Wallet top-up transaction updated to PAID', { transactionId, userId, amountCents });
					} catch (txnErr: any) {
						logger.error('Failed to update wallet top-up transaction', {
							error: txnErr.message,
							transactionId,
							userId,
							amountCents
						});
					}
				} else if (!transactionId) {
					logger.warn('No transactionId found in Stripe session metadata for wallet top-up', {
						sessionId: session.id,
						userId,
						amountCents
					});
				}
			} else if (type === 'addon_payment' && userId && galleryId) {
				// Addon payment - create backup storage addon and trigger ZIP generation Lambda
				const BACKUP_STORAGE_MULTIPLIER = 0.3; // Should match the multiplier used in purchaseAddon
				const backupStorageCents = amountCents;
				const generateZipsFnName = envProc?.env?.GENERATE_ZIPS_FOR_ADDON_FN_NAME as string;
				
				logger.info('Processing addon_payment', { 
					galleryId, 
					userId, 
					backupStorageCents,
					hasGenerateZipsFnName: !!generateZipsFnName,
					generateZipsFnName
				});
				
				try {
					// Check if addon already exists (idempotency check)
					const { hasAddon } = require('../../lib/src/addons');
					const addonExists = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
					
					if (!addonExists) {
						// Create addon
						await createBackupStorageAddon(galleryId, backupStorageCents, BACKUP_STORAGE_MULTIPLIER);
						logger.info('Backup storage addon created via webhook', { 
							galleryId, 
							backupStorageCents, 
							multiplier: BACKUP_STORAGE_MULTIPLIER,
							paymentId
						});
						
						// Trigger ZIP generation Lambda asynchronously (fire and forget)
						if (generateZipsFnName) {
							try {
								const payload = Buffer.from(JSON.stringify({ galleryId }));
								logger.info('Invoking ZIP generation Lambda', { 
									galleryId, 
									generateZipsFnName,
									payload: payload.toString()
								});
								await lambda.send(new InvokeCommand({ 
									FunctionName: generateZipsFnName, 
									Payload: payload, 
									InvocationType: 'Event' // Asynchronous invocation
								}));
								logger.info('Successfully triggered ZIP generation Lambda for addon purchase', { 
									galleryId, 
									generateZipsFnName 
								});
							} catch (invokeErr: any) {
								logger.error('Failed to invoke ZIP generation Lambda', {
									error: {
										name: invokeErr.name,
										message: invokeErr.message,
										code: invokeErr.code,
										stack: invokeErr.stack
									},
									galleryId,
									generateZipsFnName
								});
								// Don't fail the webhook - addon is created, ZIPs can be generated later manually
							}
						} else {
							logger.warn('GENERATE_ZIPS_FOR_ADDON_FN_NAME not configured, ZIPs will not be generated automatically', { 
								galleryId,
								envKeys: Object.keys(envProc?.env || {})
							});
						}
					} else {
						logger.info('Backup storage addon already exists for gallery (webhook)', { galleryId, paymentId });
					}
				} catch (addonErr: any) {
					logger.error('Failed to create backup storage addon via webhook', {
						error: addonErr.message,
						galleryId,
						paymentId
					});
					// Continue to record payment even if addon creation fails
				}
			} else if (type === 'gallery_payment' && userId && galleryId) {
				// Gallery payment (from create or pay button) - mark gallery as paid
				if (!galleriesTable) {
					logger.error('Cannot process gallery payment: GALLERIES_TABLE not configured', { galleryId, userId, paymentId });
				} else {
					// First get the gallery to check selectionEnabled
					const galleryGet = await ddb.send(new GetCommand({
						TableName: galleriesTable,
						Key: { galleryId }
					}));
					
					const gallery = galleryGet.Item as any;
					if (!gallery) {
						logger.error('Gallery not found for payment', { galleryId, userId, paymentId });
					} else {
						const now = new Date().toISOString();
						
						// Calculate normal expiry based on plan metadata
						// Get plan metadata from create.ts or use default
						const plan = gallery.plan || session.metadata?.plan || '1GB-1m';
						const PRICING_PLANS: Record<string, { expiryDays: number }> = {
							'1GB-1m': { expiryDays: 30 },
							'1GB-3m': { expiryDays: 90 },
							'1GB-12m': { expiryDays: 365 },
							'3GB-1m': { expiryDays: 30 },
							'3GB-3m': { expiryDays: 90 },
							'3GB-12m': { expiryDays: 365 },
							'10GB-1m': { expiryDays: 30 },
							'10GB-3m': { expiryDays: 90 },
							'10GB-12m': { expiryDays: 365 }
						};
						const planMetadata = PRICING_PLANS[plan] || PRICING_PLANS['1GB-1m'];
						const expiryDays = planMetadata.expiryDays;
						
						// Calculate normal expiry date (from now, not from creation)
						const expiresAtDate = new Date(new Date(now).getTime() + expiryDays * 24 * 60 * 60 * 1000);
						const expiresAt = expiresAtDate.toISOString();
						
						// Update gallery state, remove TTL, set normal expiry, and selectionStatus if selection is enabled
						// Note: 'state' and 'ttl' are reserved keywords in DynamoDB, so we use ExpressionAttributeNames
						const updateExpr = gallery.selectionEnabled
							? 'SET #state = :s, expiresAt = :e, selectionStatus = :ss, updatedAt = :u REMOVE #ttl'
							: 'SET #state = :s, expiresAt = :e, updatedAt = :u REMOVE #ttl';
						
						const exprValues: any = {
							':s': 'PAID_ACTIVE',
							':e': expiresAt,
							':o': userId,
							':u': now
						};
						
						const exprNames: any = {
							'#state': 'state',
							'#ttl': 'ttl'
						};
						
						if (gallery.selectionEnabled) {
							exprValues[':ss'] = 'NOT_STARTED';
						}
						
						await ddb.send(new UpdateCommand({
							TableName: galleriesTable,
							Key: { galleryId },
							UpdateExpression: updateExpr,
							ConditionExpression: 'ownerId = :o',
							ExpressionAttributeValues: exprValues,
							ExpressionAttributeNames: exprNames
						}));
						
						const previousState = gallery.state || 'UNKNOWN';
						logger.info('Gallery marked as paid, TTL removed, normal expiry set', {
							galleryId,
							userId,
							paymentId,
							previousState,
							newState: 'PAID_ACTIVE',
							selectionEnabled: gallery.selectionEnabled,
							amountCents,
							expiresAt,
							expiryDays
						});
						
						// Create backup storage addon if requested during gallery creation (Stripe payment)
						// Note: Addon should already exist (created during gallery creation), but ensure it exists
						const hasBackupStorage = session.metadata?.hasBackupStorage === 'true' || session.metadata?.hasBackupStorage === true;
						const addonPriceCents = session.metadata?.addonPriceCents ? parseInt(session.metadata.addonPriceCents, 10) : 0;
						if (hasBackupStorage && addonPriceCents > 0) {
							try {
								const { hasAddon } = require('../../lib/src/addons');
								const addonExists = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
								
								if (!addonExists) {
									// Addon should have been created during gallery creation, but create it now if missing
									const BACKUP_STORAGE_MULTIPLIER = 0.3;
									await createBackupStorageAddon(galleryId, addonPriceCents, BACKUP_STORAGE_MULTIPLIER);
									logger.info('Backup storage addon created via webhook (was missing)', { 
										galleryId, 
										addonPriceCents, 
										multiplier: BACKUP_STORAGE_MULTIPLIER,
										paymentId
									});
									
									// Trigger ZIP generation Lambda asynchronously if addon was created
									const generateZipsFnName = envProc?.env?.GENERATE_ZIPS_FOR_ADDON_FN_NAME as string;
									if (generateZipsFnName) {
										try {
											const payload = Buffer.from(JSON.stringify({ galleryId }));
											await lambda.send(new InvokeCommand({ 
												FunctionName: generateZipsFnName, 
												Payload: payload, 
												InvocationType: 'Event' // Asynchronous invocation
											}));
											logger.info('Triggered ZIP generation Lambda for addon purchase (gallery creation)', { 
												galleryId, 
												generateZipsFnName 
											});
										} catch (invokeErr: any) {
											logger.error('Failed to invoke ZIP generation Lambda', {
												error: invokeErr.message,
												galleryId,
												generateZipsFnName
											});
										}
									}
								} else {
									logger.info('Backup storage addon already exists for gallery (webhook)', { galleryId, paymentId });
									
									// Trigger ZIP generation Lambda even if addon already exists (payment completed)
									const generateZipsFnName = envProc?.env?.GENERATE_ZIPS_FOR_ADDON_FN_NAME as string;
									if (generateZipsFnName) {
										try {
											const payload = Buffer.from(JSON.stringify({ galleryId }));
											await lambda.send(new InvokeCommand({ 
												FunctionName: generateZipsFnName, 
												Payload: payload, 
												InvocationType: 'Event' // Asynchronous invocation
											}));
											logger.info('Triggered ZIP generation Lambda for addon purchase (gallery creation - addon existed)', { 
												galleryId, 
												generateZipsFnName 
											});
										} catch (invokeErr: any) {
											logger.error('Failed to invoke ZIP generation Lambda', {
												error: invokeErr.message,
												galleryId,
												generateZipsFnName
											});
										}
									}
								}
							} catch (addonErr: any) {
								logger.error('Failed to create backup storage addon via webhook (gallery creation)', {
									error: addonErr.message,
									galleryId,
									paymentId
								});
								// Continue - addon can be purchased later
							}
						}
						
						// If selection is disabled, create an order immediately with AWAITING_FINAL_PHOTOS status
						// This allows photographer to upload finals, manage payment, but not send final link until photos are uploaded
						if (!gallery.selectionEnabled && ordersTable) {
							try {
								const orderNumber = (gallery.lastOrderNumber ?? 0) + 1;
								const orderId = `${orderNumber}-${Date.now()}`;
								await ddb.send(new PutCommand({
									TableName: ordersTable,
									Item: {
										galleryId,
										orderId,
										orderNumber,
										deliveryStatus: 'AWAITING_FINAL_PHOTOS', // Start with AWAITING_FINAL_PHOTOS - photographer can upload finals and manage payment
										paymentStatus: 'UNPAID',
										selectedKeys: [], // Empty means all photos
										selectedCount: 0, // Will be updated when photos are processed
										overageCount: 0,
										overageCents: 0,
										totalCents: 0,
										createdAt: now
									}
								}));
								// Update gallery with order info
								await ddb.send(new UpdateCommand({
									TableName: galleriesTable,
									Key: { galleryId },
									UpdateExpression: 'SET lastOrderNumber = :n, currentOrderId = :oid, updatedAt = :u',
									ExpressionAttributeValues: {
										':n': orderNumber,
										':oid': orderId,
										':u': now
									}
								}));
								logger.info('Order created immediately for non-selection gallery (webhook)', { galleryId, orderId });
							} catch (orderErr: any) {
								// Log but don't fail payment processing if order creation fails
								logger.error('Failed to create order for non-selection gallery (webhook)', {
									error: {
										name: orderErr.name,
										message: orderErr.message
									},
									galleryId
								});
							}
						}
					}
				}
			}

			// Record payment
			if (paymentsTable) {
				await ddb.send(new PutCommand({
					TableName: paymentsTable,
					Item: {
						paymentId,
						status: 'COMPLETED',
						amount: amountCents,
						currency: 'pln',
						type,
						userId,
						galleryId: galleryId || null,
						stripeSessionId: session.id,
						createdAt: new Date().toISOString()
					}
				}));
			}
		} else if (stripeEvent.type === 'checkout.session.expired') {
			const session = stripeEvent.data.object;
			const userId = session.metadata?.userId;
			const transactionId = session.metadata?.transactionId;

			if (transactionId && userId) {
				try {
					const transaction = await getTransaction(userId, transactionId);
					if (transaction && transaction.status === 'UNPAID') {
						await updateTransactionStatus(userId, transactionId, 'CANCELED');
						logger.info('Transaction status updated to CANCELED (session expired)', { transactionId, userId });
					}
				} catch (txnErr: any) {
					logger.error('Failed to update transaction status (expired)', {
						error: txnErr.message,
						transactionId,
						userId
					});
				}
			}
		} else if (stripeEvent.type === 'payment_intent.payment_failed') {
			const paymentIntent = stripeEvent.data.object;
			const userId = paymentIntent.metadata?.userId;
			const transactionId = paymentIntent.metadata?.transactionId;

			if (transactionId && userId) {
				try {
					const transaction = await getTransaction(userId, transactionId);
					if (transaction && transaction.status === 'UNPAID') {
						await updateTransactionStatus(userId, transactionId, 'FAILED');
						logger.info('Transaction status updated to FAILED', { transactionId, userId });
					}
				} catch (txnErr: any) {
					logger.error('Failed to update transaction status (failed)', {
						error: txnErr.message,
						transactionId,
						userId
					});
				}
			}
		} else if (stripeEvent.type === 'payment_intent.canceled') {
			const paymentIntent = stripeEvent.data.object;
			const userId = paymentIntent.metadata?.userId;
			const transactionId = paymentIntent.metadata?.transactionId;

			if (transactionId && userId) {
				try {
					const transaction = await getTransaction(userId, transactionId);
					if (transaction && transaction.status === 'UNPAID') {
						await updateTransactionStatus(userId, transactionId, 'CANCELED');
						logger.info('Transaction status updated to CANCELED (payment intent canceled)', { transactionId, userId });
					}
				} catch (txnErr: any) {
					logger.error('Failed to update transaction status (canceled)', {
						error: txnErr.message,
						transactionId,
						userId
					});
				}
			}
		}

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ received: true })
		};
	} catch (error: any) {
		console.error('Webhook processing failed:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Processing failed', message: error.message })
		};
	}
});
