import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
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
						const { PRICING_PLANS } = await import('../../lib/src/pricing');
						const planMetadata = PRICING_PLANS[plan as keyof typeof PRICING_PLANS] || PRICING_PLANS['1GB-1m'];
						const expiryDays = planMetadata.expiryDays;
						
						// Calculate normal expiry date (from now, not from creation)
						const expiresAtDate = new Date(new Date(now).getTime() + expiryDays * 24 * 60 * 60 * 1000);
						const expiresAt = expiresAtDate.toISOString();
						
						// Ensure originalsLimitBytes and finalsLimitBytes are set (use plan metadata if not already set)
						const originalsLimitBytes = gallery.originalsLimitBytes || planMetadata.storageLimitBytes;
						const finalsLimitBytes = gallery.finalsLimitBytes || planMetadata.storageLimitBytes;
						
						// Update gallery state, remove TTL, set normal expiry, storage limits, and selectionStatus if selection is enabled
						// Note: 'state' and 'ttl' are reserved keywords in DynamoDB, so we use ExpressionAttributeNames
						const updateExpr = gallery.selectionEnabled
							? 'SET #state = :s, expiresAt = :e, originalsLimitBytes = :olb, finalsLimitBytes = :flb, selectionStatus = :ss, updatedAt = :u REMOVE #ttl'
							: 'SET #state = :s, expiresAt = :e, originalsLimitBytes = :olb, finalsLimitBytes = :flb, updatedAt = :u REMOVE #ttl';
						
						const exprValues: any = {
							':s': 'PAID_ACTIVE',
							':e': expiresAt,
							':olb': originalsLimitBytes,
							':flb': finalsLimitBytes,
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
						
						// USER-CENTRIC FIX #4: Remove paymentLocked flag when payment succeeds
						const updateExprWithUnlock = updateExpr.replace('REMOVE #ttl', 'REMOVE #ttl, paymentLocked');
						
						await ddb.send(new UpdateCommand({
							TableName: galleriesTable,
							Key: { galleryId },
							UpdateExpression: updateExprWithUnlock,
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
			} else if (type === 'gallery_plan_upgrade' && userId && galleryId) {
				// Plan upgrade payment - update gallery with new plan
				if (!galleriesTable) {
					logger.error('Cannot process plan upgrade: GALLERIES_TABLE not configured', { galleryId, userId, paymentId });
				} else {
					const galleryGet = await ddb.send(new GetCommand({
						TableName: galleriesTable,
						Key: { galleryId }
					}));
					
					const gallery = galleryGet.Item as any;
					if (!gallery) {
						logger.error('Gallery not found for plan upgrade', { galleryId, userId, paymentId });
					} else {
						const newPlanKey = session.metadata?.plan;
						const previousPlanKey = session.metadata?.previousPlan;
						
						if (!newPlanKey) {
							logger.error('Missing plan in upgrade metadata', { galleryId, userId, paymentId, metadata: session.metadata });
						} else {
							// Get plan metadata
							const { PRICING_PLANS } = await import('../../lib/src/pricing');
							const planMetadata = PRICING_PLANS[newPlanKey as keyof typeof PRICING_PLANS];
							
							if (planMetadata) {
								const newPriceCents = parseInt(session.metadata?.newPriceCents || '0');
								const now = new Date().toISOString();
								
								// USER-CENTRIC FIX #7: Keep original expiry date, only upgrade storage size
								// Update gallery with new plan but keep original expiresAt
								await ddb.send(new UpdateCommand({
									TableName: galleriesTable,
									Key: { galleryId },
									UpdateExpression: 'SET plan = :plan, priceCents = :price, originalsLimitBytes = :olb, finalsLimitBytes = :flb, updatedAt = :u REMOVE paymentLocked',
									ExpressionAttributeValues: {
										':plan': newPlanKey,
										':price': newPriceCents,
										':olb': planMetadata.storageLimitBytes,
										':flb': planMetadata.storageLimitBytes,
										':u': now
										// Note: expiresAt is NOT updated - keeps original expiry date
									}
								}));
								
								logger.info('Gallery plan upgraded via webhook', {
									galleryId,
									userId,
									previousPlan: previousPlanKey,
									newPlan: newPlanKey,
									paymentId
								});
							} else {
								logger.error('Invalid plan key in upgrade metadata', { 
									galleryId, 
									userId, 
									paymentId, 
									newPlanKey 
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
						
						// USER-CENTRIC FIX: Clear paymentLocked flag when session expires
						if (transaction.galleryId && galleriesTable) {
							try {
								await ddb.send(new UpdateCommand({
									TableName: galleriesTable,
									Key: { galleryId: transaction.galleryId },
									UpdateExpression: 'REMOVE paymentLocked, paymentLockedAt SET updatedAt = :u',
									ExpressionAttributeValues: {
										':u': new Date().toISOString()
									}
								}));
								logger.info('Cleared paymentLocked flag after session expiry', { galleryId: transaction.galleryId });
							} catch (unlockErr: any) {
								logger.warn('Failed to clear paymentLocked flag on session expiry', {
									error: unlockErr.message,
									galleryId: transaction.galleryId
								});
							}
						}
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
						
						// USER-CENTRIC FIX: Clear paymentLocked flag when payment fails
						if (transaction.galleryId && galleriesTable) {
							try {
								await ddb.send(new UpdateCommand({
									TableName: galleriesTable,
									Key: { galleryId: transaction.galleryId },
									UpdateExpression: 'REMOVE paymentLocked, paymentLockedAt SET updatedAt = :u',
									ExpressionAttributeValues: {
										':u': new Date().toISOString()
									}
								}));
								logger.info('Cleared paymentLocked flag after payment failure', { galleryId: transaction.galleryId });
							} catch (unlockErr: any) {
								logger.warn('Failed to clear paymentLocked flag on payment failure', {
									error: unlockErr.message,
									galleryId: transaction.galleryId
								});
							}
						}
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
						
						// USER-CENTRIC FIX: Clear paymentLocked flag when payment is cancelled
						if (transaction.galleryId && galleriesTable) {
							try {
								await ddb.send(new UpdateCommand({
									TableName: galleriesTable,
									Key: { galleryId: transaction.galleryId },
									UpdateExpression: 'REMOVE paymentLocked, paymentLockedAt SET updatedAt = :u',
									ExpressionAttributeValues: {
										':u': new Date().toISOString()
									}
								}));
								logger.info('Cleared paymentLocked flag after payment cancellation', { galleryId: transaction.galleryId });
							} catch (unlockErr: any) {
								logger.warn('Failed to clear paymentLocked flag on payment cancellation', {
									error: unlockErr.message,
									galleryId: transaction.galleryId
								});
							}
						}
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
