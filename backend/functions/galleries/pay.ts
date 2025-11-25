import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery, getUnpaidTransactionForGallery, listTransactionsByUser, createTransaction, updateTransactionStatus } from '../../lib/src/transactions';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function getWalletBalance(userId: string, walletsTable: string): Promise<number> {
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

async function debitWallet(userId: string, amountCents: number, walletsTable: string, ledgerTable: string, transactionId: string, isDryRun?: boolean): Promise<boolean> {
	// CRITICAL SAFETY CHECK: Never debit wallet in dry run mode
	if (isDryRun === true) {
		throw new Error('CRITICAL: Attempted to debit wallet in dry run mode - this should never happen!');
	}
	
	const now = new Date().toISOString();
	
	try {
		const walletGet = await ddb.send(new GetCommand({
			TableName: walletsTable,
			Key: { userId }
		}));
		
		const currentBalance = walletGet.Item?.balanceCents || 0;
		if (currentBalance < amountCents) {
			return false;
		}

		const newBalance = currentBalance - amountCents;

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

			// Create ledger entry (use PutCommand to create if doesn't exist)
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

			return true;
		} catch (err: any) {
			if (err.name === 'ConditionalCheckFailedException') {
				return false;
			}
			throw err;
		}
	} catch (error) {
		console.error('Wallet debit failed:', error);
		return false;
	}
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const apiUrl = envProc?.env?.PUBLIC_API_URL as string || '';
	// Always use wallet if available (no need for useWallet parameter)

	if (!galleriesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing GALLERIES_TABLE' })
		};
	}

	if (!stripeSecretKey) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Stripe not configured' })
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

	const ownerId = getUserIdFromEvent(event);
	if (!ownerId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	// Get gallery
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

	requireOwnerOr403(gallery.ownerId, ownerId);

	// Parse request body for dryRun parameter
	let body: any = {};
	try {
		if (event.body) {
			if (typeof event.body === 'string') {
				// Try to parse as JSON
				try {
					const parsed = JSON.parse(event.body);
					// CRITICAL: If parsed result is an array, something went wrong - log and ignore
					if (Array.isArray(parsed)) {
						logger.error('Body parsed as array instead of object - this should not happen!', { 
							bodyString: event.body.substring(0, 200),
							parsedLength: parsed.length 
						});
						body = {};
					} else {
						body = parsed;
					}
				} catch (parseErr) {
					logger.warn('Failed to parse body as JSON string', { error: parseErr, bodyPreview: event.body.substring(0, 100) });
					body = {};
				}
			} else if (typeof event.body === 'object') {
				// Already an object (might happen with Express middleware)
				// CRITICAL: If it's an array, something went wrong
				if (Array.isArray(event.body)) {
					logger.error('Body is an array instead of object - this should not happen!', { 
						bodyLength: event.body.length,
						bodyPreview: JSON.stringify(event.body).substring(0, 200)
					});
					body = {};
				} else {
					body = event.body;
				}
			}
		}
	} catch (err) {
		logger.warn('Failed to parse request body', { error: err, bodyType: typeof event.body });
		body = {};
	}
	
	// CRITICAL: Check dryRun parameter - must be explicitly true
	// Only check if body is a non-array object
	const dryRun = body && typeof body === 'object' && !Array.isArray(body) && body.dryRun === true;
	const forceStripeOnly = body && typeof body === 'object' && !Array.isArray(body) && body.forceStripeOnly === true;
	logger.info('Payment request received', { 
		galleryId, 
		dryRun,
		forceStripeOnly,
		hasBody: !!event.body, 
		bodyType: typeof body,
		isArray: Array.isArray(body),
		bodyKeys: body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [],
		bodyDryRun: body && typeof body === 'object' && !Array.isArray(body) ? body.dryRun : undefined,
		bodyPreview: body && typeof body === 'object' ? JSON.stringify(body).substring(0, 200) : String(body).substring(0, 200)
	});

	// CRITICAL: In dry run mode, calculate amounts WITHOUT any database writes
	// We'll do minimal reads (gallery, wallet balance) but NO writes
	if (dryRun) {
		logger.info('DRY RUN MODE - calculating amounts without processing payment', { galleryId });
		
		// Get wallet balance for calculation (read-only)
		const walletsTable = envProc?.env?.WALLETS_TABLE as string;
		const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
		let walletAmountCents = 0;
		let stripeAmountCents = 0;
		
		// Calculate amounts from gallery pricing
		let plan = gallery.plan || '1GB-1m';
		let galleryPriceCents = gallery.priceCents || 0;
		
		// Check for backup storage addon (read-only query)
		const galleryAddonsTable = envProc?.env?.GALLERY_ADDONS_TABLE as string;
		let addonPriceCents = 0;
		if (galleryAddonsTable) {
			try {
				const addonsQuery = await ddb.send(new QueryCommand({
					TableName: galleryAddonsTable,
					KeyConditionExpression: 'galleryId = :g AND addonId = :a',
					ExpressionAttributeValues: {
						':g': galleryId,
						':a': 'BACKUP_STORAGE'
					}
				}));
				if (addonsQuery.Items && addonsQuery.Items.length > 0) {
					const addon = addonsQuery.Items[0] as any;
					addonPriceCents = addon.priceCents || 0;
				}
			} catch (err) {
				logger.warn('Failed to query addons in dry run', { error: err });
			}
		}
		
		const totalAmountCents = galleryPriceCents + addonPriceCents;
		
		// Calculate wallet vs stripe amounts based on current wallet balance (read-only)
		if (forceStripeOnly) {
			// User chose to pay full amount via Stripe (ignoring wallet balance)
			walletAmountCents = 0;
			stripeAmountCents = totalAmountCents;
		} else if (walletsTable && ledgerTable) {
			const walletBalance = await getWalletBalance(ownerId, walletsTable);
			if (walletBalance >= totalAmountCents) {
				walletAmountCents = totalAmountCents;
				stripeAmountCents = 0;
			} else if (walletBalance > 0) {
				walletAmountCents = walletBalance;
				stripeAmountCents = totalAmountCents - walletBalance;
			} else {
				walletAmountCents = 0;
				stripeAmountCents = totalAmountCents;
			}
		} else {
			stripeAmountCents = totalAmountCents;
		}
		
		// Return dry run response - NO DATABASE WRITES
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				totalAmountCents,
				walletAmountCents,
				stripeAmountCents,
				dryRun: true
			})
		};
	}

	// Check if gallery is already paid (from transactions) - use same logic as get.ts and list.ts
	// CRITICAL: This must use transactions as source of truth, not gallery.state
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	let isPaid = false;
	if (transactionsTable) {
		try {
			const paidTransaction = await getPaidTransactionForGallery(galleryId);
			isPaid = !!paidTransaction;
			logger.info('Payment status check', { 
				galleryId, 
				isPaid, 
				hasPaidTransaction: !!paidTransaction,
				galleryState: gallery.state 
			});
		} catch (err) {
			logger.warn('Failed to check paid transaction, falling back to gallery state', { 
				error: err,
				galleryId,
				galleryState: gallery.state 
			});
			// Fall back to gallery state only if transaction check fails
			isPaid = gallery.state === 'PAID_ACTIVE';
		}
	} else {
		// If transactions table not configured, use gallery state
		isPaid = gallery.state === 'PAID_ACTIVE';
	}

	// In dry run mode, allow checking even if paid (for UI display purposes)
	// In non-dry-run mode, reject if already paid
	if (isPaid && !dryRun) {
		logger.warn('Payment attempt for already paid gallery', { 
			galleryId, 
			isPaid,
			galleryState: gallery.state 
		});
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery is already paid' })
		};
	}

	// Find existing UNPAID transaction for this gallery
	// Try GSI first (optimal, eventually consistent), fall back to userId query (strongly consistent) if needed
	let existingTransaction: any = null;
	if (transactionsTable) {
		try {
			// Primary method: Try GSI query first (optimal, direct lookup by galleryId)
			logger.info('Querying transactions via GSI (optimal)', { galleryId });
			existingTransaction = await getUnpaidTransactionForGallery(galleryId);
			if (existingTransaction) {
				logger.info('Found existing UNPAID transaction via GSI', { 
					transactionId: existingTransaction.transactionId, 
					galleryId,
					amountCents: existingTransaction.amountCents
				});
			} else {
				logger.info('No transaction found via GSI, trying fallback query by userId (strongly consistent)', { galleryId });
				// Fallback: Query by userId (strongly consistent on partition key)
				// This handles cases where GSI hasn't indexed the transaction yet (eventual consistency)
				try {
					const transactionsResult = await listTransactionsByUser(ownerId, {
						type: 'GALLERY_PLAN',
						status: 'UNPAID',
						limit: 100
					});
					logger.info('Fallback query returned transactions', { 
						count: transactionsResult.transactions.length,
						galleryId 
					});
					existingTransaction = transactionsResult.transactions.find((tx: any) => tx.galleryId === galleryId) || null;
					if (existingTransaction) {
						logger.info('Found existing UNPAID transaction via fallback query', { 
							transactionId: existingTransaction.transactionId, 
							galleryId,
							amountCents: existingTransaction.amountCents
						});
					} else {
						logger.info('No matching transaction found in fallback query', { 
							galleryId,
							foundTransactionGalleryIds: transactionsResult.transactions.map((tx: any) => tx.galleryId)
						});
					}
				} catch (fallbackErr: any) {
					const fallbackErrorMessage = fallbackErr?.message || fallbackErr?.toString() || JSON.stringify(fallbackErr) || 'Unknown error';
					logger.error('Fallback query also failed', { 
						error: fallbackErrorMessage,
						galleryId,
						ownerId
					});
					// Fallback failure is non-critical, GSI already returned null
				}
			}
		} catch (err: any) {
			const errorMessage = err?.message || err?.toString() || JSON.stringify(err) || 'Unknown error';
			const errorName = err?.name || err?.errorName || 'UnknownError';
			
			logger.error('Failed to query transactions via GSI', { 
				error: errorMessage,
				errorName,
				galleryId,
				stack: err?.stack
			});
			
			// Fallback: Try userId query if GSI fails
			try {
				logger.info('Attempting fallback query by userId (strongly consistent)', { ownerId, galleryId });
				const transactionsResult = await listTransactionsByUser(ownerId, {
					type: 'GALLERY_PLAN',
					status: 'UNPAID',
					limit: 100
				});
				logger.info('Fallback query returned transactions', { 
					count: transactionsResult.transactions.length,
					galleryId 
				});
				existingTransaction = transactionsResult.transactions.find((tx: any) => tx.galleryId === galleryId) || null;
				if (existingTransaction) {
					logger.info('Found existing UNPAID transaction via fallback query after GSI error', { 
						transactionId: existingTransaction.transactionId, 
						galleryId,
						amountCents: existingTransaction.amountCents
					});
				} else {
					logger.warn('Fallback query found transactions but none match galleryId', { 
						galleryId,
						foundTransactionIds: transactionsResult.transactions.map((tx: any) => ({
							transactionId: tx.transactionId,
							galleryId: tx.galleryId
						}))
					});
				}
			} catch (fallbackErr: any) {
				const fallbackErrorMessage = fallbackErr?.message || fallbackErr?.toString() || JSON.stringify(fallbackErr) || 'Unknown error';
				logger.error('Both GSI and fallback queries failed', { 
					gsiError: errorMessage,
					gsiErrorName: errorName,
					fallbackError: fallbackErrorMessage,
					fallbackErrorName: fallbackErr?.name,
					galleryId,
					ownerId
				});
				// Don't silently fail - rethrow if it's a critical error
				if (errorMessage.includes('TRANSACTIONS_TABLE')) {
					throw err;
				}
			}
		}
	}

	// Calculate amounts from gallery pricing (for dry run or if no transaction exists)
	let plan = gallery.plan || '1GB-1m';
	let galleryPriceCents = gallery.priceCents || 0;
	
	// Check for backup storage addon
	const galleryAddonsTable = envProc?.env?.GALLERY_ADDONS_TABLE as string;
	let addonPriceCents = 0;
	let hasBackupStorage = false;
	if (galleryAddonsTable) {
		try {
			const addonsQuery = await ddb.send(new QueryCommand({
				TableName: galleryAddonsTable,
				KeyConditionExpression: 'galleryId = :g AND addonId = :a',
				ExpressionAttributeValues: {
					':g': galleryId,
					':a': 'BACKUP_STORAGE'
				}
			}));
			if (addonsQuery.Items && addonsQuery.Items.length > 0) {
				const addon = addonsQuery.Items[0] as any;
				addonPriceCents = addon.priceCents || 0;
				hasBackupStorage = true;
			}
		} catch (err) {
			logger.warn('Failed to query addons', { error: err });
		}
	}
	
	let totalAmountCents = galleryPriceCents + addonPriceCents;
	
	// Calculate wallet vs stripe amounts
	let walletAmountCents = 0;
	let stripeAmountCents = totalAmountCents;
	
	if (forceStripeOnly) {
		// User chose to pay full amount via Stripe (ignoring wallet balance)
		walletAmountCents = 0;
		stripeAmountCents = totalAmountCents;
	} else if (walletsTable && ledgerTable) {
		const walletBalance = await getWalletBalance(ownerId, walletsTable);
		if (walletBalance >= totalAmountCents) {
			walletAmountCents = totalAmountCents;
			stripeAmountCents = 0;
		} else if (walletBalance > 0) {
			walletAmountCents = walletBalance;
			stripeAmountCents = totalAmountCents - walletBalance;
		}
	}

	// NOTE: Dry run is handled at the top of the function (line 153)
	// This code path only executes when dryRun is false

	// If no transaction exists, create one now
	if (!existingTransaction) {
		if (!transactionsTable) {
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Transactions table not configured' })
			};
		}

		try {
			// Build composites list for frontend display
			const composites: string[] = [`Gallery Plan ${plan}`];
			if (hasBackupStorage) {
				composites.push('Backup addon');
			}
			
			// Create transaction with UNPAID status
			const newTransactionId = await createTransaction(
				ownerId,
				'GALLERY_PLAN',
				totalAmountCents,
				{
					galleryId,
					walletAmountCents,
					stripeAmountCents,
					paymentMethod: walletAmountCents > 0 && stripeAmountCents > 0 ? 'MIXED' : walletAmountCents > 0 ? 'WALLET' : 'STRIPE' as any,
					composites,
					metadata: {
						plan,
						hasBackupStorage,
						addonPriceCents
					}
				}
			);
			logger.info('Transaction created on-demand (UNPAID)', { transactionId: newTransactionId, galleryId, totalAmountCents });
			
			// Fetch the newly created transaction
			existingTransaction = await getUnpaidTransactionForGallery(galleryId);
			if (!existingTransaction) {
				return {
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Failed to retrieve created transaction' })
				};
			}
		} catch (err: any) {
			logger.error('Failed to create transaction', {
				error: err.message,
				galleryId
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Failed to create transaction: ' + err.message })
			};
		}
	}

	// Use transaction as source of truth - override calculated values with transaction values
	const transactionId = existingTransaction.transactionId;
	totalAmountCents = existingTransaction.amountCents;
	plan = existingTransaction.metadata?.plan || plan;
	
	// Get plan metadata for expiry calculation
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
	hasBackupStorage = existingTransaction.metadata?.hasBackupStorage === true || existingTransaction.metadata?.hasBackupStorage === 'true' || hasBackupStorage;
	addonPriceCents = existingTransaction.metadata?.addonPriceCents ? parseInt(existingTransaction.metadata.addonPriceCents.toString()) : addonPriceCents;
	galleryPriceCents = totalAmountCents - addonPriceCents;

	// Try wallet payment first if enabled
	// Recalculate wallet/stripe amounts based on CURRENT wallet balance (not transaction's stored values)
	// Transaction amounts are just a snapshot from creation time, wallet balance may have changed
	let paid = false;
	let checkoutUrl: string | undefined;
	let walletBalance = 0;

	if (forceStripeOnly) {
		// User chose to pay full amount via Stripe (ignoring wallet balance)
		logger.info('Force Stripe only payment - ignoring wallet balance', {
			galleryId,
			totalAmountCents
		});
		walletAmountCents = 0;
		stripeAmountCents = totalAmountCents;
	} else if (walletsTable && ledgerTable) {
		walletBalance = await getWalletBalance(ownerId, walletsTable);
		
		// Recalculate wallet vs stripe amounts based on current balance
		if (walletBalance >= totalAmountCents) {
			walletAmountCents = totalAmountCents;
			stripeAmountCents = 0;
		} else if (walletBalance > 0) {
			walletAmountCents = walletBalance;
			stripeAmountCents = totalAmountCents - walletBalance;
		} else {
			walletAmountCents = 0;
			stripeAmountCents = totalAmountCents;
		}
	} else {
		// No wallet tables configured, full Stripe payment
		walletAmountCents = 0;
		stripeAmountCents = totalAmountCents;
	}
	
	// NOTE: Dry run is handled at the top of the function (line 153)
	// This code path only executes when dryRun is false
	
	// Process actual payment (dry run already handled above)
	// CRITICAL: Double-check dryRun is false before processing
	if (dryRun) {
		logger.error('CRITICAL ERROR: dryRun is true but reached payment processing code - this should never happen!', {
			galleryId,
			transactionId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Internal error: dry run check failed' })
		};
	}
	
	// Process wallet payment if balance is sufficient and not forcing Stripe only
	if (!forceStripeOnly && walletsTable && ledgerTable && walletBalance >= totalAmountCents) {
			logger.info('Processing wallet payment (NOT dry run)', {
				galleryId,
				transactionId,
				amountCents: totalAmountCents,
				walletBalance,
				dryRun: false // Explicitly log that dryRun is false
			});
			paid = await debitWallet(ownerId, totalAmountCents, walletsTable, ledgerTable, transactionId, false);
			if (paid) {
				walletAmountCents = totalAmountCents;
				stripeAmountCents = 0;
				
				logger.info('Wallet debit succeeded, updating transaction and gallery state', {
					galleryId,
					transactionId,
					walletAmountCents
				});
				
				// CRITICAL: Update transaction status to PAID FIRST, then update gallery state
				// This ensures consistency - if transaction is PAID, gallery should be PAID_ACTIVE
				if (transactionsTable) {
					await updateTransactionStatus(ownerId, transactionId, 'PAID');
					// Also update paymentMethod and amounts to reflect wallet payment
					await ddb.send(new UpdateCommand({
						TableName: transactionsTable,
						Key: { userId: ownerId, transactionId },
						UpdateExpression: 'SET paymentMethod = :pm, walletAmountCents = :wa, stripeAmountCents = :sa',
						ExpressionAttributeValues: {
							':pm': 'WALLET',
							':wa': walletAmountCents,
							':sa': stripeAmountCents
						}
					}));
					logger.info('Transaction updated to PAID', { galleryId, transactionId });
				}
				
				// Remove TTL and set normal expiry, update gallery state to PAID_ACTIVE
				// CRITICAL: This MUST happen after transaction update to maintain consistency
				const now = new Date().toISOString();
				const expiresAtDate = new Date(new Date(now).getTime() + expiryDays * 24 * 60 * 60 * 1000);
				const expiresAt = expiresAtDate.toISOString();
				
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET #state = :s, expiresAt = :e, selectionStatus = :ss, updatedAt = :u REMOVE #ttl',
					ExpressionAttributeNames: {
						'#state': 'state',
						'#ttl': 'ttl'
					},
					ExpressionAttributeValues: {
						':s': 'PAID_ACTIVE',
						':e': expiresAt,
						':ss': gallery.selectionEnabled ? 'NOT_STARTED' : 'DISABLED',
						':u': now
					}
				}));
				logger.info('Gallery state updated to PAID_ACTIVE', { galleryId, expiresAt });
				
				logger.info('Gallery paid via wallet, TTL removed, state updated to PAID_ACTIVE', {
					galleryId,
					transactionId,
					expiresAt
				});
				
				return {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						paid: true,
						method: 'wallet',
						galleryId,
						transactionId,
						totalAmountCents,
						walletAmountCents
					})
				};
			}
		}

	// If payment was already completed via wallet, return success
	if (paid) {
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				paid: true,
				method: 'wallet',
				galleryId,
				transactionId,
				totalAmountCents,
				walletAmountCents
			})
		};
	}

	// If no Stripe amount needed (wallet-only payment), but wallet payment failed, return error
	if (stripeAmountCents === 0) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Wallet payment failed. Please try again or contact support.' })
		};
	}

	// If not fully paid with wallet, create Stripe checkout
	if (!stripeSecretKey) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Stripe not configured and wallet payment failed' })
		};
	}

	try {
		const stripe = new Stripe(stripeSecretKey);
		const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
		const redirectUrl = `${dashboardUrl}/galleries?payment=success&gallery=${galleryId}`;
		
		const successUrl = apiUrl 
			? `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`
			: `https://your-frontend/payments/success?session_id={CHECKOUT_SESSION_ID}`;
		const cancelUrl = apiUrl
			? `${apiUrl}/payments/cancel?transactionId=${transactionId}&userId=${ownerId}`
			: `https://your-frontend/payments/cancel?transactionId=${transactionId}&userId=${ownerId}`;

		// Build line items from transaction
		const lineItems: any[] = [];
		
		// Gallery plan line item
		if (galleryPriceCents > 0) {
			lineItems.push({
				price_data: {
					currency: 'pln',
					product_data: {
						name: `Gallery: ${galleryId}`,
						description: `PhotoHub gallery payment - ${plan} plan${walletAmountCents > 0 ? ` (${(walletAmountCents / 100).toFixed(2)} PLN from wallet)` : ''}`
					},
					unit_amount: walletAmountCents > 0 ? Math.round((galleryPriceCents / totalAmountCents) * stripeAmountCents) : galleryPriceCents
				},
				quantity: 1
			});
		}
		
		// Addon line item (if included in transaction)
		if (hasBackupStorage && addonPriceCents > 0) {
			const addonStripeAmount = walletAmountCents > 0 ? Math.round((addonPriceCents / totalAmountCents) * stripeAmountCents) : addonPriceCents;
			lineItems.push({
				price_data: {
					currency: 'pln',
					product_data: {
						name: 'Backup Storage Addon',
						description: `Backup storage addon for gallery ${galleryId}`
					},
					unit_amount: addonStripeAmount
				},
				quantity: 1
			});
		}

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			mode: 'payment',
			line_items: lineItems,
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: {
				userId: ownerId,
				type: 'gallery_payment',
				galleryId,
				transactionId: transactionId,
				walletAmountCents: walletAmountCents.toString(),
				stripeAmountCents: stripeAmountCents.toString(),
				hasBackupStorage: hasBackupStorage ? 'true' : 'false',
				addonPriceCents: addonPriceCents.toString(),
				redirectUrl: redirectUrl
			}
		});

		// Update existing transaction with Stripe session ID and payment method if it exists
		if (transactionId && transactionsTable) {
			try {
				await updateTransactionStatus(ownerId, transactionId, 'UNPAID', {
					stripeSessionId: session.id
				});
				// If forceStripeOnly is true, update payment method to STRIPE (not MIXED)
				if (forceStripeOnly) {
					await ddb.send(new UpdateCommand({
						TableName: transactionsTable,
						Key: { userId: ownerId, transactionId },
						UpdateExpression: 'SET paymentMethod = :pm, walletAmountCents = :wa, stripeAmountCents = :sa',
						ExpressionAttributeValues: {
							':pm': 'STRIPE',
							':wa': 0,
							':sa': stripeAmountCents
						}
					}));
					logger.info('Updated transaction payment method to STRIPE (forceStripeOnly)', {
						transactionId,
						galleryId,
						stripeAmountCents
					});
				}
			} catch (txnErr: any) {
				logger.warn('Failed to update transaction with Stripe session ID', {
					error: txnErr.message,
					transactionId
				});
			}
		}

		logger.info('Stripe checkout session created for gallery payment', {
			checkoutUrl: session.url,
			sessionId: session.id,
			galleryId
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				checkoutUrl: session.url,
				sessionId: session.id,
				galleryId,
				transactionId,
				totalAmountCents,
				walletAmountCents,
				stripeAmountCents
			})
		};
	} catch (err: any) {
		logger.error('Stripe checkout creation failed for gallery payment', {
			error: {
				name: err.name,
				message: err.message,
				code: err.code,
				type: err.type,
				stack: err.stack
			},
			galleryId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to create checkout session', message: err.message })
		};
	}
});

