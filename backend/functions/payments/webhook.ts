import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { createBackupStorageAddon, ADDON_TYPES } from '../../lib/src/addons';

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

			if (type === 'wallet_topup' && userId) {
				// Credit wallet
				const newBalance = await creditWallet(userId, amountCents, paymentId, walletsTable, ledgerTable);
				logger.info('Wallet credited', { userId, amountCents, newBalance, paymentId });
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
						
						// Update gallery state and selectionStatus if selection is enabled
						// Note: 'state' is a reserved keyword in DynamoDB, so we use ExpressionAttributeNames
						const updateExpr = gallery.selectionEnabled
							? 'SET #state = :s, selectionStatus = :ss, updatedAt = :u'
							: 'SET #state = :s, updatedAt = :u';
						
						const exprValues: any = {
							':s': 'PAID_ACTIVE',
							':o': userId,
							':u': now
						};
						
						const exprNames: any = {
							'#state': 'state'
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
						logger.info('Gallery marked as paid', {
							galleryId,
							userId,
							paymentId,
							previousState,
							newState: 'PAID_ACTIVE',
							selectionEnabled: gallery.selectionEnabled,
							amountCents
						});
						
						// Create backup storage addon if requested during gallery creation (Stripe payment)
						const hasBackupStorage = session.metadata?.hasBackupStorage === 'true';
						const addonPriceCents = session.metadata?.addonPriceCents ? parseInt(session.metadata.addonPriceCents, 10) : 0;
						if (hasBackupStorage && addonPriceCents > 0) {
							try {
								const { hasAddon } = require('../../lib/src/addons');
								const addonExists = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
								
								if (!addonExists) {
									const BACKUP_STORAGE_MULTIPLIER = 0.3;
									await createBackupStorageAddon(galleryId, addonPriceCents, BACKUP_STORAGE_MULTIPLIER);
									logger.info('Backup storage addon created during gallery creation (Stripe payment)', { 
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
						
						// If selection is disabled, create an order immediately with APPROVED status
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
										status: 'APPROVED',
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
