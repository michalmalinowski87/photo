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

// Helper function to process a checkout session (used by EventBridge webhook handler)
async function processCheckoutSession(
	session: any,
	stripe: any,
	logger: any,
	walletsTable: string,
	ledgerTable: string,
	paymentsTable: string | undefined,
	galleriesTable: string | undefined,
	ordersTable: string | undefined,
	envProc: any
) {
	const userId = session.metadata?.userId;
	const type = session.metadata?.type || 'wallet_topup';
	const galleryId = session.metadata?.galleryId;
	const transactionId = session.metadata?.transactionId;
	const amountCents = session.amount_total;
	const paymentId = `pay_${session.id}`;

	logger.info('Processing checkout session', {
		sessionId: session.id,
		userId,
		type,
		galleryId,
		transactionId,
		amountCents,
		paymentId,
		paymentStatus: session.payment_status,
		status: session.status,
		hasMetadata: !!session.metadata,
		metadataKeys: session.metadata ? Object.keys(session.metadata) : [],
		metadata: session.metadata, // Log full metadata for debugging
	});

	// Check for duplicate processing
	if (paymentsTable) {
		const existing = await ddb.send(new GetCommand({
			TableName: paymentsTable,
			Key: { paymentId }
		}));
		if (existing.Item) {
			logger.info('Payment already processed', { paymentId, sessionId: session.id });
			return; // Already processed, skip
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
		logger.info('Processing wallet top-up', {
			userId,
			amountCents,
			paymentId,
			sessionId: session.id,
			hasWalletsTable: !!walletsTable,
			hasLedgerTable: !!ledgerTable,
		});

		// Credit wallet
		try {
			const newBalance = await creditWallet(userId, amountCents, paymentId, walletsTable, ledgerTable);
			logger.info('Wallet credited successfully', { 
				userId, 
				amountCents, 
				newBalance, 
				paymentId,
				sessionId: session.id,
			});
		} catch (creditErr: any) {
			logger.error('Failed to credit wallet', {
				error: {
					name: creditErr.name,
					message: creditErr.message,
					stack: creditErr.stack,
				},
				userId,
				amountCents,
				paymentId,
				sessionId: session.id,
			});
			// Continue to update transaction even if wallet credit fails
		}
		
		// Update existing transaction for wallet top-up (created when checkout session was created)
		const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
		if (transactionsTable && transactionId) {
			try {
				logger.info('Updating wallet top-up transaction status to PAID', {
					transactionId,
					userId,
					sessionId: session.id,
				});
				const { updateTransactionStatus } = require('../../lib/src/transactions');
				await updateTransactionStatus(userId, transactionId, 'PAID', {
					stripeSessionId: session.id,
					stripePaymentIntentId: session.payment_intent as string
				});
				logger.info('Wallet top-up transaction updated to PAID successfully', { 
					transactionId, 
					userId, 
					amountCents,
					sessionId: session.id,
				});
			} catch (txnErr: any) {
				logger.error('Failed to update wallet top-up transaction', {
					error: {
						name: txnErr.name,
						message: txnErr.message,
						stack: txnErr.stack,
					},
					transactionId,
					userId,
					amountCents,
					sessionId: session.id,
				});
			}
		} else {
			logger.warn('Cannot update transaction - missing table or transactionId', {
				sessionId: session.id,
				userId,
				amountCents,
				hasTransactionsTable: !!transactionsTable,
				transactionId: transactionId || 'missing',
			});
		}
	} else if (type === 'gallery_payment' && userId && galleryId) {
		// Gallery payment processing logic (same as before)
		if (!galleriesTable) {
			logger.error('Cannot process gallery payment: GALLERIES_TABLE not configured', { galleryId, userId, paymentId });
		} else {
			const galleryGet = await ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			}));
			
			const gallery = galleryGet.Item as any;
			if (!gallery) {
				logger.error('Gallery not found for payment', { galleryId, userId, paymentId });
			} else {
				const now = new Date().toISOString();
				const plan = gallery.plan || session.metadata?.plan || '1GB-1m';
				const { PRICING_PLANS } = await import('../../lib/src/pricing');
				const planMetadata = PRICING_PLANS[plan as keyof typeof PRICING_PLANS] || PRICING_PLANS['1GB-1m'];
				const expiryDays = planMetadata.expiryDays;
				const expiresAtDate = new Date(new Date(now).getTime() + expiryDays * 24 * 60 * 60 * 1000);
				const expiresAt = expiresAtDate.toISOString();
				const originalsLimitBytes = gallery.originalsLimitBytes || planMetadata.storageLimitBytes;
				const finalsLimitBytes = gallery.finalsLimitBytes || planMetadata.storageLimitBytes;
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
				const updateExprWithUnlock = updateExpr.replace('REMOVE #ttl', 'REMOVE #ttl, paymentLocked');
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: updateExprWithUnlock,
					ConditionExpression: 'ownerId = :o',
					ExpressionAttributeValues: exprValues,
					ExpressionAttributeNames: exprNames
				}));
				logger.info('Gallery marked as paid', { galleryId, userId, paymentId, amountCents, expiresAt });
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
								deliveryStatus: 'AWAITING_FINAL_PHOTOS',
								paymentStatus: 'UNPAID',
								selectedKeys: [],
								selectedCount: 0,
								overageCount: 0,
								overageCents: 0,
								totalCents: 0,
								createdAt: now
							}
						}));
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
						logger.info('Order created for non-selection gallery', { galleryId, orderId });
					} catch (orderErr: any) {
						logger.error('Failed to create order', { error: orderErr.message, galleryId });
					}
				}
			}
		}
	} else if (type === 'gallery_plan_upgrade' && userId && galleryId) {
		// Plan upgrade processing (same as before)
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
				if (!newPlanKey) {
					logger.error('Missing plan in upgrade metadata', { galleryId, userId, paymentId });
				} else {
					const { PRICING_PLANS } = await import('../../lib/src/pricing');
					const planMetadata = PRICING_PLANS[newPlanKey as keyof typeof PRICING_PLANS];
					if (planMetadata) {
						const newPriceCents = parseInt(session.metadata?.newPriceCents || '0');
						const now = new Date().toISOString();
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
							}
						}));
						logger.info('Gallery plan upgraded', { galleryId, userId, newPlan: newPlanKey, paymentId });
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

// Helper function to credit wallet (used internally by processCheckoutSession)
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
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
	const paymentsTable = envProc?.env?.PAYMENTS_TABLE as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;

	// CRITICAL: Log raw event structure FIRST to diagnose EventBridge delivery
	logger.info('Webhook handler invoked - raw event structure', {
		eventType: typeof event,
		isArray: Array.isArray(event),
		eventKeys: typeof event === 'object' && event !== null ? Object.keys(event) : [],
		hasSource: !!event?.source,
		source: event?.source,
		hasDetailType: !!event?.['detail-type'],
		detailType: event?.['detail-type'],
		hasId: !!event?.id,
		eventId: event?.id,
		eventPreview: JSON.stringify(event).substring(0, 500), // First 500 chars
	});

	// EventBridge can send events as an array (batch) or single event
	// Handle both cases
	const events = Array.isArray(event) ? event : [event];
	
	logger.info('Processing events', {
		eventCount: events.length,
		events: events.map((e: any) => ({
			source: e?.source,
			detailType: e?.['detail-type'],
			id: e?.id,
			hasDetail: !!e?.detail
		}))
	});

	// Validate configuration before processing
	if (!stripeSecretKey || !walletsTable || !ledgerTable) {
		logger.error('Missing required configuration', {
			hasStripeSecretKey: !!stripeSecretKey,
			hasWalletsTable: !!walletsTable,
			hasLedgerTable: !!ledgerTable,
		});
		throw new Error('Missing required configuration');
	}

	if (!galleriesTable) {
		logger.warn('GALLERIES_TABLE not configured, gallery payment updates will be skipped');
	}

	// Initialize Stripe client for any API calls needed during processing
	const stripe = new Stripe(stripeSecretKey);

	// Process each event
	const results: Array<{ success: boolean; eventId?: string; error?: string }> = [];
	
	for (const evt of events) {
		try {
			// Verify this is an EventBridge event from Stripe
			if (!evt.source || !evt.source.startsWith('aws.partner/stripe.com')) {
				logger.error('Invalid event source - expected EventBridge event from Stripe', {
					source: evt.source,
					hasSource: !!evt.source,
					allEventKeys: typeof evt === 'object' && evt !== null ? Object.keys(evt) : [],
					eventPreview: JSON.stringify(evt).substring(0, 500),
				});
				results.push({ success: false, eventId: evt?.id, error: 'Invalid event source' });
				continue;
			}

			// Log initial request for debugging
			logger.info('Processing EventBridge event from Stripe', {
				source: evt.source,
				detailType: evt['detail-type'],
				eventId: evt.id,
				hasStripeSecretKey: !!stripeSecretKey,
				hasWalletsTable: !!walletsTable,
				hasLedgerTable: !!ledgerTable,
				hasPaymentsTable: !!paymentsTable,
				hasGalleriesTable: !!galleriesTable,
				hasDetail: !!evt.detail,
			});

			// Convert EventBridge event format to Stripe event format
			// EventBridge detail contains the full Stripe event object
			// The actual object (checkout session, charge, etc.) is at detail.data.object
			// Structure: evt.detail = { id: "evt_...", data: { object: { id: "cs_...", ... } } }
			const detailObject = evt.detail?.data?.object;
			const stripeEvent = {
				id: evt.detail?.id || evt.id, // Use Stripe event ID if available, fallback to EventBridge ID
				type: evt['detail-type'],
				api_version: evt.detail?.api_version || '2025-10-29.clover',
				created: evt.detail?.created || Math.floor(Date.now() / 1000),
				data: {
					object: detailObject || evt.detail // Extract the actual object from detail.data.object, fallback to detail if structure is different
				},
				livemode: evt.detail?.livemode || false,
				pending_webhooks: evt.detail?.pending_webhooks || 0,
				request: evt.detail?.request || null
			};
			
			// Log structure for debugging
			logger.info('Event structure analysis', {
				hasDetail: !!evt.detail,
				hasDetailData: !!evt.detail?.data,
				hasDetailDataObject: !!evt.detail?.data?.object,
				detailObjectType: evt.detail?.data?.object?.object,
				detailObjectId: evt.detail?.data?.object?.id,
				extractedObjectType: stripeEvent.data?.object?.object,
				extractedObjectId: stripeEvent.data?.object?.id,
			});

			logger.info('Converted EventBridge event to Stripe event format', {
				eventType: stripeEvent.type,
				eventId: stripeEvent.id,
				hasData: !!stripeEvent.data,
				hasObject: !!stripeEvent.data?.object,
				objectType: stripeEvent.data?.object?.object,
				objectId: stripeEvent.data?.object?.id,
				objectKeys: stripeEvent.data?.object ? Object.keys(stripeEvent.data.object).slice(0, 10) : [],
			});

			logger.info('Processing Stripe event', {
				eventType: stripeEvent.type,
				eventId: stripeEvent.id,
			});

			if (stripeEvent.type === 'checkout.session.completed') {
				const session = stripeEvent.data.object;
				
				logger.info('Received checkout.session.completed event', {
					sessionId: session.id,
					paymentStatus: session.payment_status,
					status: session.status,
					amountTotal: session.amount_total,
					hasMetadata: !!session.metadata,
					metadataType: session.metadata?.type,
					metadataUserId: session.metadata?.userId,
					metadataTransactionId: session.metadata?.transactionId,
				});
				
				// Only process if payment is actually complete
				if (session.payment_status === 'paid' && session.status === 'complete') {
					logger.info('Processing checkout.session.completed - payment is paid and complete', {
						sessionId: session.id,
					});
					await processCheckoutSession(session, stripe, logger, walletsTable, ledgerTable, paymentsTable, galleriesTable, ordersTable, envProc);
					logger.info('Successfully processed checkout.session.completed', {
						sessionId: session.id,
					});
					results.push({ success: true, eventId: stripeEvent.id });
				} else {
					logger.warn('Checkout session is not paid/complete, skipping', {
						sessionId: session.id,
						paymentStatus: session.payment_status,
						status: session.status,
					});
					results.push({ success: true, eventId: stripeEvent.id }); // Success but skipped
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
				results.push({ success: true, eventId: stripeEvent.id });
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
				results.push({ success: true, eventId: stripeEvent.id });
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
				results.push({ success: true, eventId: stripeEvent.id });
			} else if (stripeEvent.type === 'payment_intent.succeeded') {
				// payment_intent.succeeded - payment intent was successfully created
				// This is a confirmation event, but checkout.session.completed is the authoritative event
				// We can use this for tracking/logging purposes
				const paymentIntent = stripeEvent.data.object;
				logger.info('Payment intent succeeded', {
					paymentIntentId: paymentIntent.id,
					amount: paymentIntent.amount,
					currency: paymentIntent.currency,
					status: paymentIntent.status,
				});
				// Don't process here - wait for checkout.session.completed for the authoritative processing
				results.push({ success: true, eventId: stripeEvent.id });
			} else if (stripeEvent.type === 'charge.succeeded') {
				// charge.succeeded - charge was successfully created
				// This is a confirmation event, but checkout.session.completed is the authoritative event
				const charge = stripeEvent.data.object;
				logger.info('Charge succeeded', {
					chargeId: charge.id,
					amount: charge.amount,
					currency: charge.currency,
					paymentIntentId: charge.payment_intent,
					status: charge.status,
				});
				// Don't process here - wait for checkout.session.completed for the authoritative processing
				results.push({ success: true, eventId: stripeEvent.id });
			} else if (stripeEvent.type === 'charge.updated') {
				// charge.updated - charge was updated (e.g., balance_transaction added)
				// This is informational, checkout.session.completed is the authoritative event
				const charge = stripeEvent.data.object;
				logger.info('Charge updated', {
					chargeId: charge.id,
					amount: charge.amount,
					currency: charge.currency,
					paymentIntentId: charge.payment_intent,
					status: charge.status,
					hasBalanceTransaction: !!charge.balance_transaction,
				});
				// Don't process here - checkout.session.completed is the authoritative event
				results.push({ success: true, eventId: stripeEvent.id });
			} else {
				// Unknown event type - log but don't fail
				logger.info('Unhandled event type, skipping', {
					eventType: stripeEvent.type,
					eventId: stripeEvent.id,
				});
				results.push({ success: true, eventId: stripeEvent.id }); // Success but unhandled
			}

			logger.info('Event processing completed successfully', {
				eventType: stripeEvent.type,
				eventId: stripeEvent.id,
			});
		} catch (error: any) {
			logger.error('Event processing failed', {
				error: {
					name: error.name,
					message: error.message,
					stack: error.stack,
				},
				eventId: evt?.id,
			});
			results.push({ success: false, eventId: evt?.id, error: error.message });
		}
	}

	// Log summary
	const successCount = results.filter(r => r.success).length;
	const failureCount = results.filter(r => !r.success).length;
	logger.info('Batch processing completed', {
		totalEvents: events.length,
		successCount,
		failureCount,
		results
	});

	// If any events failed, throw error to trigger retry
	if (failureCount > 0) {
		throw new Error(`Failed to process ${failureCount} of ${events.length} events`);
	}

	// EventBridge - return success to mark events as processed
	return { statusCode: 200 };
});
