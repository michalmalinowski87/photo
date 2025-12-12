import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery, getUnpaidTransactionForGallery, listTransactionsByUser, createTransaction, updateTransactionStatus } from '../../lib/src/transactions';
import { PRICING_PLANS, calculatePriceWithDiscount, type PlanKey } from '../../lib/src/pricing';
import { recalculateStorageInternal } from './recalculateBytesUsed';
import { cancelExpirySchedule, createExpirySchedule, getScheduleName } from '../../lib/src/expiry-scheduler';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Calculate Stripe processing fees for PLN payments
 * Stripe fees: ~1.4% + 1 PLN for domestic cards, ~2.9% + 1 PLN for international cards
 * We use a conservative estimate: 2.9% + 1 PLN to ensure we cover fees
 * @param amountCents Amount in cents
 * @returns Stripe fee in cents (rounded up)
 */
function calculateStripeFee(amountCents: number): number {
	// Stripe fee: 2.9% + 1 PLN (100 cents)
	// Using conservative estimate to ensure we cover fees
	const feePercentage = 0.029; // 2.9%
	const fixedFeeCents = 100; // 1 PLN
	const percentageFee = Math.ceil(amountCents * feePercentage);
	return percentageFee + fixedFeeCents;
}

/**
 * Calculate amount to charge user including Stripe fees
 * User pays: baseAmount + Stripe fees
 * PhotoCloud receives: baseAmount (after Stripe deducts fees)
 * @param baseAmountCents Base amount in cents (what PhotoCloud should receive)
 * @returns Amount to charge user in cents (including Stripe fees)
 */
function calculateAmountWithStripeFee(baseAmountCents: number): number {
	// We need to solve: chargeAmount - calculateStripeFee(chargeAmount) = baseAmountCents
	// chargeAmount - (chargeAmount * 0.029 + 100) = baseAmountCents
	// chargeAmount * (1 - 0.029) - 100 = baseAmountCents
	// chargeAmount * 0.971 = baseAmountCents + 100
	// chargeAmount = (baseAmountCents + 100) / 0.971
	
	const fixedFeeCents = 100; // 1 PLN
	const feeMultiplier = 1 - 0.029; // 0.971 (after 2.9% fee)
	const chargeAmount = Math.ceil((baseAmountCents + fixedFeeCents) / feeMultiplier);
	return chargeAmount;
}

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
		logger.error('Missing GALLERIES_TABLE environment variable');
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing GALLERIES_TABLE' })
		};
	}

	if (!stripeSecretKey || stripeSecretKey.trim() === '' || stripeSecretKey.includes('...')) {
		logger.error('Missing or invalid STRIPE_SECRET_KEY environment variable', {
			hasEnvProc: !!envProc,
			hasEnv: !!envProc?.env,
			hasStripeKey: !!stripeSecretKey,
			stripeKeyLength: stripeSecretKey?.length || 0,
			stripeKeyPrefix: stripeSecretKey?.substring(0, 10) || 'N/A',
			envKeys: envProc?.env ? Object.keys(envProc.env).filter(k => k.includes('STRIPE') || k.includes('stripe')) : [],
			allEnvKeys: envProc?.env ? Object.keys(envProc.env).slice(0, 10) : [] // First 10 keys for debugging
		});
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

	let gallery = galleryGet.Item as any;
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
	const redirectUrl = body && typeof body === 'object' && !Array.isArray(body) ? body.redirectUrl : undefined;
	logger.info('Payment request received', { 
		galleryId, 
		dryRun,
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
		
		// NEW: Allow plan to be passed in request body for dry run (for use before plan is set on gallery)
		// This enables payment method calculation before plan selection
		let plan: string | undefined;
		let galleryPriceCents: number | undefined;
		
		if (body.plan && body.priceCents) {
			// Plan provided in request body (for dry run before plan is set)
			plan = body.plan;
			galleryPriceCents = typeof body.priceCents === 'number' ? body.priceCents : parseInt(body.priceCents, 10);
			logger.info('Dry run using plan from request body', { plan, galleryPriceCents });
		} else if (gallery.plan && gallery.priceCents) {
			// Use plan from gallery (existing behavior)
			plan = gallery.plan;
			galleryPriceCents = gallery.priceCents;
			logger.info('Dry run using plan from gallery', { plan, galleryPriceCents });
		} else {
			// No plan available - return error
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Gallery plan not set',
					message: 'Please provide plan and priceCents in request body, or set plan on gallery first.'
				})
			};
		}
		
		// At this point, galleryPriceCents is guaranteed to be defined (we return early if not)
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const totalAmountCents = galleryPriceCents!;
		
		// Calculate wallet vs stripe amounts based on current wallet balance (read-only)
		// Use full wallet if sufficient, otherwise full Stripe (no partial payments)
		if (walletsTable && ledgerTable) {
			const walletBalance = await getWalletBalance(ownerId, walletsTable);
			if (walletBalance >= totalAmountCents) {
				walletAmountCents = totalAmountCents;
				stripeAmountCents = 0;
			} else {
				// Insufficient wallet balance - use full Stripe payment
				walletAmountCents = 0;
				stripeAmountCents = totalAmountCents;
			}
		} else {
			// No wallet tables configured, full Stripe payment
			walletAmountCents = 0;
			stripeAmountCents = totalAmountCents;
		}
		
		// Determine payment method (only WALLET or STRIPE, no MIXED)
		let paymentMethod: 'WALLET' | 'STRIPE' = 'STRIPE';
		if (walletAmountCents > 0) {
			paymentMethod = 'WALLET';
		}
		
		// Calculate Stripe fee if Stripe will be used (for warning display)
		let stripeFeeCents = 0;
		if (stripeAmountCents > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			stripeFeeCents = calculateStripeFee(galleryPriceCents!);
		}
		
		// Return dry run response - NO DATABASE WRITES
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				totalAmountCents,
				walletAmountCents,
				stripeAmountCents,
				paymentMethod,
				stripeFeeCents,
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

	// Check if gallery has a plan - if not, require plan calculation first
	if (!gallery.plan || !gallery.priceCents || !gallery.originalsLimitBytes || !gallery.finalsLimitBytes) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Gallery plan not set',
				message: 'Please calculate and select a plan before payment. Call /galleries/:id/calculate-plan first.'
			})
		};
	}

	// USER-CENTRIC FIX #4 & #5: Recalculate plan before payment to ensure it still fits
	// This prevents paying for stale plan if user uploaded more photos or deleted photos
	// Trigger on-demand recalculation to ensure DB is accurate before payment
	// This is critical - user may have uploaded/deleted images just before clicking pay
	// Trigger on-demand recalculation to get accurate bytes from DB
	// Direct call bypasses cache for immediate recalculation - critical for payment accuracy
	// Include both originals and finals bytes for plan calculation
	let currentUploadedSize = (gallery.originalsBytesUsed || 0) + (gallery.finalsBytesUsed || 0);
	
	try {
		// Force immediate recalculation (bypasses cache) - critical for payment accuracy
		const bucket = envProc?.env?.GALLERIES_BUCKET as string;
		if (!bucket) {
			logger?.warn('GALLERIES_BUCKET not set, skipping recalculation before payment', { galleryId });
		} else {
			const recalcResult = await recalculateStorageInternal(galleryId, galleriesTable, bucket, gallery, logger, true);
			logger?.info('Triggered on-demand storage recalculation before payment', { galleryId });
		
		// Extract recalculated value from result
		if (recalcResult?.body) {
			try {
				const body = JSON.parse(recalcResult.body);
				if (body.originalsBytesUsed !== undefined || body.finalsBytesUsed !== undefined) {
					const originalsBytes = body.originalsBytesUsed || 0;
					const finalsBytes = body.finalsBytesUsed || 0;
					currentUploadedSize = originalsBytes + finalsBytes;
					logger?.info('Using recalculated storage from on-demand recalculation (originals + finals)', {
						galleryId,
						originalsBytesUsed: originalsBytes,
						finalsBytesUsed: finalsBytes,
						totalUploadedSize: currentUploadedSize
					});
				}
			} catch {
				// If parsing fails, re-fetch gallery to get updated bytes
				const updatedGalleryGet = await ddb.send(new GetCommand({
					TableName: galleriesTable,
					Key: { galleryId }
				}));
				if (updatedGalleryGet.Item) {
					gallery = updatedGalleryGet.Item;
					currentUploadedSize = (updatedGalleryGet.Item.originalsBytesUsed || 0) + (updatedGalleryGet.Item.finalsBytesUsed || 0);
				}
			}
		} else {
			// Re-fetch gallery to get updated bytes
			const updatedGalleryGet = await ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			}));
			if (updatedGalleryGet.Item) {
				gallery = updatedGalleryGet.Item;
				currentUploadedSize = (updatedGalleryGet.Item.originalsBytesUsed || 0) + (updatedGalleryGet.Item.finalsBytesUsed || 0);
			}
		}
		}
	} catch (recalcErr: any) {
		logger?.error('Failed to recalculate storage before payment', {
			error: recalcErr.message,
			galleryId
		});
		// Use current gallery value - this is acceptable as storage is tracked in real-time
		currentUploadedSize = (gallery.originalsBytesUsed || 0) + (gallery.finalsBytesUsed || 0);
	}

	// Check if uploaded size exceeds plan limit
	if (currentUploadedSize > gallery.originalsLimitBytes) {
		const usedGB = (currentUploadedSize / (1024 * 1024 * 1024)).toFixed(2);
		const limitGB = (gallery.originalsLimitBytes / (1024 * 1024 * 1024)).toFixed(0);
		const excessGB = ((currentUploadedSize - gallery.originalsLimitBytes) / (1024 * 1024 * 1024)).toFixed(2);
		
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Uploaded size exceeds plan limit',
				message: `Cannot proceed with payment. Current uploads (${usedGB} GB) exceed selected plan limit (${limitGB} GB) by ${excessGB} GB. Please recalculate plan or delete excess files.`,
				uploadedSizeBytes: currentUploadedSize,
				planLimitBytes: gallery.originalsLimitBytes,
				excessBytes: currentUploadedSize - gallery.originalsLimitBytes,
				requiresRecalculation: true
			})
		};
	}

	// Check if user is at/near capacity (95%+) - warn but allow payment
	if (gallery.originalsLimitBytes) {
		const usagePercentage = (currentUploadedSize / gallery.originalsLimitBytes) * 100;
		if (usagePercentage >= 95) {
			logger.warn('User paying for gallery at/near capacity', {
				galleryId,
				usagePercentage: usagePercentage.toFixed(2),
				uploadedSizeBytes: currentUploadedSize,
				limitBytes: gallery.originalsLimitBytes
			});
			// Don't block payment, but log warning for monitoring
		}
	}

	// Ensure gallery has originalsLimitBytes and finalsLimitBytes set
	// If not set, calculate from plan metadata
	if (!gallery.originalsLimitBytes || !gallery.finalsLimitBytes) {
		const planMetadata = PRICING_PLANS[gallery.plan as keyof typeof PRICING_PLANS];
		if (planMetadata) {
			// Update gallery with limits if missing
			await ddb.send(new UpdateCommand({
				TableName: galleriesTable,
				Key: { galleryId },
				UpdateExpression: 'SET originalsLimitBytes = :olb, finalsLimitBytes = :flb, updatedAt = :u',
				ExpressionAttributeValues: {
					':olb': planMetadata.storageLimitBytes,
					':flb': planMetadata.storageLimitBytes,
					':u': new Date().toISOString()
				}
			}));
			gallery.originalsLimitBytes = planMetadata.storageLimitBytes;
			gallery.finalsLimitBytes = planMetadata.storageLimitBytes;
		}
	}

	// Calculate amounts from gallery pricing (for dry run or if no transaction exists)
	let plan = gallery.plan;
	let galleryPriceCents = gallery.priceCents;
	
	let totalAmountCents = galleryPriceCents;
	
	// Calculate wallet vs stripe amounts
	let walletAmountCents = 0;
	let stripeAmountCents = totalAmountCents;
	
	// Check wallet balance - use full wallet if sufficient, otherwise full Stripe (no partial payments)
	if (walletsTable && ledgerTable) {
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
			
			// USER-CENTRIC FIX #6 & #11: Store plan details in transaction metadata (not just gallery)
			// This prevents race conditions where plan is overwritten before payment completes
			// Also store plan calculation timestamp to detect stale calculations
			const planCalculationTimestamp = gallery.planCalculationTimestamp || new Date().toISOString();
			
			// Create transaction with UNPAID status
			const newTransactionId = await createTransaction(
				ownerId,
				'GALLERY_PLAN',
				totalAmountCents,
				{
					galleryId,
					walletAmountCents,
					stripeAmountCents,
					paymentMethod: walletAmountCents > 0 ? 'WALLET' : 'STRIPE' as any,
					composites,
					metadata: {
						plan,
						priceCents: galleryPriceCents,
						originalsLimitBytes: gallery.originalsLimitBytes,
						finalsLimitBytes: gallery.finalsLimitBytes,
						planCalculationTimestamp,
						// Store original plan details for upgrade calculations later
						originalPlan: plan,
						originalPriceCents: galleryPriceCents,
						originalSelectionEnabled: gallery.selectionEnabled !== false
					}
				}
			);
			
			// USER-CENTRIC FIX #4: Lock uploads once plan is set and payment initiated
			// Set paymentLocked flag to prevent concurrent uploads during payment
			await ddb.send(new UpdateCommand({
				TableName: galleriesTable,
				Key: { galleryId },
				UpdateExpression: 'SET paymentLocked = :pl, paymentLockedAt = :pla, updatedAt = :u',
				ExpressionAttributeValues: {
					':pl': true,
					':pla': new Date().toISOString(),
					':u': new Date().toISOString()
				}
			}));
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
	const planMetadata = PRICING_PLANS[plan as keyof typeof PRICING_PLANS] || PRICING_PLANS['1GB-1m'];
	const expiryDays = planMetadata.expiryDays;
	galleryPriceCents = totalAmountCents;

	// Try wallet payment first if enabled
	// Recalculate wallet/stripe amounts based on CURRENT wallet balance (not transaction's stored values)
	// Transaction amounts are just a snapshot from creation time, wallet balance may have changed
	let paid = false;
	let checkoutUrl: string | undefined;
	let walletBalance = 0;

	// Check wallet balance - use full wallet if sufficient, otherwise full Stripe (no partial payments)
	if (walletsTable && ledgerTable) {
		walletBalance = await getWalletBalance(ownerId, walletsTable);
		
		// Use full wallet if sufficient, otherwise full Stripe
		if (walletBalance >= totalAmountCents) {
			walletAmountCents = totalAmountCents;
			stripeAmountCents = 0;
		} else {
			// Insufficient wallet balance - use full Stripe payment
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
	
	// Process wallet payment if balance is sufficient
	if (walletsTable && ledgerTable && walletBalance >= totalAmountCents) {
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
				
				// Cancel old EventBridge schedule (if exists) and create new one for paid expiry
				const oldScheduleName = gallery.expiryScheduleName || getScheduleName(galleryId);
				const deletionLambdaArn = envProc?.env?.GALLERY_EXPIRY_DELETION_LAMBDA_ARN as string;
				const scheduleRoleArn = envProc?.env?.GALLERY_EXPIRY_SCHEDULE_ROLE_ARN as string;
				const dlqArn = envProc?.env?.GALLERY_EXPIRY_DLQ_ARN as string;
				
				let newScheduleName: string | undefined;
				if (deletionLambdaArn && scheduleRoleArn) {
					try {
						// Cancel old schedule (idempotent - won't fail if doesn't exist)
						await cancelExpirySchedule(oldScheduleName);
						logger.info('Canceled old EventBridge schedule', { galleryId, oldScheduleName });
						
						// Create new schedule for paid expiry
						newScheduleName = await createExpirySchedule(galleryId, expiresAt, deletionLambdaArn, scheduleRoleArn, dlqArn);
						logger.info('Created new EventBridge schedule for paid gallery', { galleryId, scheduleName: newScheduleName, expiresAt });
					} catch (scheduleErr: any) {
						logger.error('Failed to update EventBridge schedule for paid gallery', {
							error: {
								name: scheduleErr.name,
								message: scheduleErr.message
							},
							galleryId,
							expiresAt
						});
						// Continue even if schedule update fails - gallery state will still be updated
					}
				}
				
				// USER-CENTRIC FIX #4: Remove paymentLocked flag when payment succeeds
				const updateExpr = newScheduleName
					? 'SET #state = :s, expiresAt = :e, expiryScheduleName = :sn, selectionStatus = :ss, updatedAt = :u REMOVE #ttl, paymentLocked'
					: 'SET #state = :s, expiresAt = :e, selectionStatus = :ss, updatedAt = :u REMOVE #ttl, paymentLocked';
				const exprValues: any = {
					':s': 'PAID_ACTIVE',
					':e': expiresAt,
					':ss': gallery.selectionEnabled ? 'NOT_STARTED' : 'DISABLED',
					':u': now
				};
				if (newScheduleName) {
					exprValues[':sn'] = newScheduleName;
				}
				
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: updateExpr,
					ExpressionAttributeNames: {
						'#state': 'state',
						'#ttl': 'ttl'
					},
					ExpressionAttributeValues: exprValues
				}));
				logger.info('Gallery state updated to PAID_ACTIVE', { galleryId, expiresAt, scheduleName: newScheduleName });
				
				logger.info('Gallery paid via wallet, TTL removed, state updated to PAID_ACTIVE', {
					galleryId,
					transactionId,
					expiresAt,
					scheduleName: newScheduleName
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
		// ALWAYS use redirectUrl from request body if provided (this is the primary method)
		// Fallback to default only if redirectUrl is not provided
		let finalRedirectUrl = redirectUrl;
		if (!finalRedirectUrl) {
			// Log warning if redirectUrl is missing - this should not happen in normal flow
			logger.warn('redirectUrl not provided in request, using default', { galleryId });
			finalRedirectUrl = `${dashboardUrl}/galleries/${galleryId}?payment=success`;
		}
		
		const successUrl = apiUrl 
			? `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`
			: `https://your-frontend/payments/success?session_id={CHECKOUT_SESSION_ID}`;
		// Cancel URL should also redirect back to gallery view
		const cancelUrl = apiUrl
			? `${apiUrl}/payments/cancel?session_id={CHECKOUT_SESSION_ID}&transactionId=${transactionId}&userId=${ownerId}`
			: `https://your-frontend/payments/cancel?session_id={CHECKOUT_SESSION_ID}&transactionId=${transactionId}&userId=${ownerId}`;

		// USER-CENTRIC FIX: Add Stripe fees to gallery payments (user pays fees)
		// For wallet top-ups, PhotoCloud covers fees (handled in checkoutCreate.ts)
		// For gallery payments, user pays fees (we add fees to the amount charged)
		// IMPORTANT: Calculate fee on FULL plan price (galleryPriceCents), not on stripeAmountCents
		// This ensures the fee is calculated correctly on the full 7 PLN plan, not on the reduced amount after wallet deduction
		// Example: Plan is 7 PLN, wallet covers 2 PLN, Stripe should charge 5 PLN + fee calculated on 7 PLN
		const stripeFeeCents = stripeAmountCents > 0 ? calculateStripeFee(galleryPriceCents) : 0;
		const totalChargeAmountCents = stripeAmountCents + stripeFeeCents;
		
		// Build line items from transaction
		const lineItems: any[] = [];
		
		// Gallery plan line item
		// Show the portion being paid via Stripe (stripeAmountCents), but the description mentions the full plan price
		if (galleryPriceCents > 0 && stripeAmountCents > 0) {
			lineItems.push({
				price_data: {
					currency: 'pln',
					product_data: {
						name: `Gallery: ${galleryId}`,
						description: walletAmountCents > 0
							? `PhotoCloud gallery payment - ${plan} plan (${(galleryPriceCents / 100).toFixed(2)} PLN total, ${(walletAmountCents / 100).toFixed(2)} PLN from wallet)`
							: `PhotoCloud gallery payment - ${plan} plan`
					},
					unit_amount: stripeAmountCents
				},
				quantity: 1
			});
		}
		
		// Add Stripe processing fee as separate line item (user pays fees)
		// Fee is calculated on full plan price (galleryPriceCents), ensuring correct fee even when wallet is used
		if (stripeFeeCents > 0) {
			lineItems.push({
				price_data: {
					currency: 'pln',
					product_data: {
						name: 'Opłata za przetwarzanie płatności',
						description: `Stripe processing fee (calculated on ${(galleryPriceCents / 100).toFixed(2)} PLN plan)`
					},
					unit_amount: stripeFeeCents
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
				redirectUrl: finalRedirectUrl
			}
		});

		// Update existing transaction with Stripe session ID and payment method if it exists
		if (transactionId && transactionsTable) {
			try {
				await updateTransactionStatus(ownerId, transactionId, 'UNPAID', {
					stripeSessionId: session.id
				});
				// Update payment method to STRIPE (no MIXED payments)
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
				logger.info('Updated transaction payment method to STRIPE', {
						transactionId,
						galleryId,
						stripeAmountCents
					});
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

