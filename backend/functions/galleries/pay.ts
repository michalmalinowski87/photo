import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery, getUnpaidTransactionForGallery, listTransactionsByUser, createTransaction, updateTransactionStatus } from '../../lib/src/transactions';
import { PRICING_PLANS, calculatePriceWithDiscount, type PlanKey } from '../../lib/src/pricing';
import { recalculateStorageInternal } from './recalculateBytesUsed';
import { cancelExpirySchedule, createExpirySchedule, getScheduleName } from '../../lib/src/expiry-scheduler';
import { getStripeSecretKey, createStripeCheckoutSession } from '../../lib/src/stripe-config';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';
import {
	isPlanEligibleForReferralDiscount,
	validateEarnedCodeForCheckout,
	validateReferralCodeForCheckout,
	validateReferrerUserIdForCheckout,
	getReferredByUserId,
	markEarnedCodeUsed,
	markUserReferralDiscountUsed,
	grantReferrerRewardForPurchase,
	getEmailForUser,
	isBuyerFirstGalleryPurchase
} from '../../lib/src/referral';
import { createReferrerRewardEmail } from '../../lib/src/email';
import { sendRawEmailWithAttachments } from '../../lib/src/raw-email';
import { getSenderEmail } from '../../lib/src/email-config';
import { creditWallet as creditWalletLib } from '../../lib/src/wallet';
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
 * PixiProof receives: baseAmount (after Stripe deducts fees)
 * @param baseAmountCents Base amount in cents (what PixiProof should receive)
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

async function debitWallet(userId: string, amountCents: number, walletsTable: string, ledgerTable: string, transactionId: string, isDryRun?: boolean, logger?: any): Promise<boolean> {
	// CRITICAL SAFETY CHECK: Never debit wallet in dry run mode
	if (isDryRun === true) {
		throw new Error('CRITICAL: Attempted to debit wallet in dry run mode - this should never happen!');
	}
	
	const now = new Date().toISOString();
	
	logger?.info('Debiting wallet', {
		userId,
		amountCents,
		transactionId,
		walletsTable,
		ledgerTable
	});
	
	try {
		const walletGet = await ddb.send(new GetCommand({
			TableName: walletsTable,
			Key: { userId }
		}));
		
		const currentBalance = walletGet.Item?.balanceCents || 0;
		logger?.debug('Wallet balance retrieved', {
			userId,
			currentBalance,
			requestedDebit: amountCents,
			sufficientFunds: currentBalance >= amountCents
		});
		
		if (currentBalance < amountCents) {
			logger?.warn('Insufficient wallet balance', {
				userId,
				currentBalance,
				requestedDebit: amountCents,
				shortfall: amountCents - currentBalance
			});
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

			logger?.info('Wallet debit successful', {
				userId,
				amountCents,
				oldBalance: currentBalance,
				newBalance,
				transactionId
			});

			return true;
		} catch (err: any) {
			if (err.name === 'ConditionalCheckFailedException') {
				return false;
			}
			throw err;
		}
	} catch (error) {
		logger?.error('Wallet debit failed', {}, error);
		return false;
	}
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	
	logger.info('Pay endpoint handler invoked', {
		httpMethod: event?.httpMethod,
		path: event?.path,
		pathParameters: event?.pathParameters,
		hasBody: !!event?.body,
		bodyType: typeof event?.body,
		bodyLength: typeof event?.body === 'string' ? event.body.length : undefined,
		requestId: context?.awsRequestId,
	});

	try {
		const envProc = (globalThis as any).process;
		const stage = envProc?.env?.STAGE || 'dev';
		const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
		const walletsTable = envProc?.env?.WALLETS_TABLE as string;
		const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
		let apiUrl: string;
		try {
			apiUrl = await getRequiredConfigValue(stage, 'PublicApiUrl', { envVarName: 'PUBLIC_API_URL' });
		} catch (error: any) {
			logger.error('Missing PublicApiUrl configuration', { error: error.message });
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Missing configuration', message: error.message })
			};
		}
		// Always use wallet if available (no need for useWallet parameter)

		// Get Stripe secret key from SSM
		let stripeSecretKey: string;
		try {
			stripeSecretKey = await getStripeSecretKey();
		} catch (error: any) {
			logger.error('Failed to load Stripe secret key', { error: error.message });
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Stripe not configured', message: error.message })
			};
		}

		logger.info('Environment variables loaded', {
			hasGalleriesTable: !!galleriesTable,
			hasWalletsTable: !!walletsTable,
			hasLedgerTable: !!ledgerTable,
			hasStripeSecretKey: !!stripeSecretKey,
			stripeKeyLength: stripeSecretKey?.length || 0,
			hasApiUrl: !!apiUrl,
		});

		if (!galleriesTable) {
			logger.error('Missing GALLERIES_TABLE environment variable');
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Missing GALLERIES_TABLE' })
			};
		}

		if (!stripeSecretKey || stripeSecretKey.trim() === '' || stripeSecretKey.includes('...')) {
			logger.error('Missing or invalid Stripe secret key', {
				hasStripeKey: !!stripeSecretKey,
				stripeKeyLength: stripeSecretKey?.length || 0,
				stripeKeyPrefix: stripeSecretKey?.substring(0, 10) || 'N/A',
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Stripe not configured' })
			};
		}

		const galleryId = event?.pathParameters?.id;
		if (!galleryId) {
			logger.error('Missing galleryId in path parameters', {
				pathParameters: event?.pathParameters,
				path: event?.path
			});
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Missing galleryId' })
			};
		}

		logger.info('Processing payment request', {
			galleryId,
			hasBody: !!event?.body,
			bodyType: typeof event?.body
		});

		const ownerId = getUserIdFromEvent(event);
		if (!ownerId) {
			logger.error('Unauthorized - no userId found in event', {
				galleryId,
				hasHeaders: !!event?.headers,
				hasAuthorizer: !!event?.requestContext?.authorizer
			});
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized' })
			};
		}

		logger.info('User authenticated', {
			galleryId,
			ownerId
		});

		// Get gallery
		logger.info('Fetching gallery from database', { galleryId });
		let gallery: any;
		try {
			const galleryGet = await ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			}));
			gallery = galleryGet.Item as any;
			
			if (!gallery) {
				logger.error('Gallery not found in database', { galleryId });
				return {
					statusCode: 404,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Gallery not found' })
				};
			}
			
			logger.info('Gallery fetched successfully', {
				galleryId,
				state: gallery.state,
				plan: gallery.plan,
				hasPriceCents: !!gallery.priceCents
			});
		} catch (galleryErr: any) {
			logger.error('Failed to fetch gallery from database', {
				error: {
					name: galleryErr?.name,
					message: galleryErr?.message,
					code: galleryErr?.code,
					stack: galleryErr?.stack
				},
				galleryId,
				tableName: galleriesTable
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Internal server error', message: 'Failed to fetch gallery' })
			};
		}

		try {
			requireOwnerOr403(gallery.ownerId, ownerId);
			logger.info('Ownership verified', { galleryId, ownerId });
		} catch (authErr: any) {
			logger.error('Ownership verification failed', {
				error: authErr?.message,
				galleryId,
				galleryOwnerId: gallery.ownerId,
				requestOwnerId: ownerId
			});
			return {
				statusCode: 403,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Forbidden', message: authErr?.message || 'Access denied' })
			};
		}

	// Check if gallery is already paid (from transactions) - needed for both dry run and regular payment
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
		
		// Check if this is an upgrade scenario in dry run
		let isUpgradeDryRun = false;
		let priceDifferenceCentsDryRun = 0;
		
		if (body.plan && body.priceCents) {
			// Plan provided in request body (for dry run before plan is set)
			plan = body.plan;
			galleryPriceCents = typeof body.priceCents === 'number' ? body.priceCents : parseInt(body.priceCents, 10);
			
			// Check if this is an upgrade (gallery already paid and different plan)
			if (isPaid && gallery.plan && gallery.plan !== plan && galleryPriceCents) {
				const currentPlan = PRICING_PLANS[gallery.plan as PlanKey];
				const newPlan = PRICING_PLANS[plan as PlanKey];
				if (currentPlan && newPlan && newPlan.storageLimitBytes > currentPlan.storageLimitBytes) {
					isUpgradeDryRun = true;
					const isSelectionGallery = gallery.selectionEnabled !== false;
					const currentPriceCents = calculatePriceWithDiscount(gallery.plan as PlanKey, isSelectionGallery);
					priceDifferenceCentsDryRun = galleryPriceCents - currentPriceCents;
					logger.info('Dry run upgrade detected', { 
						currentPlan: gallery.plan, 
						newPlan: plan, 
						currentPrice: currentPriceCents,
						newPrice: galleryPriceCents,
						priceDifference: priceDifferenceCentsDryRun
					});
				}
			}
			
			logger.info('Dry run using plan from request body', { plan, galleryPriceCents, isUpgrade: isUpgradeDryRun });
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
		// For upgrades, use price difference; for regular payments, use full price
		if (!galleryPriceCents) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Gallery plan not set',
					message: 'Please provide plan and priceCents in request body, or set plan on gallery first.'
				})
			};
		}
		let totalAmountCents = isUpgradeDryRun ? priceDifferenceCentsDryRun : galleryPriceCents;
		let discountCentsDryRun = 0;
		const planKeyDryRun = (plan as string) || '';
		const earnedDiscountCodeId = body?.earnedDiscountCodeId ? String(body.earnedDiscountCodeId).trim() : undefined;
		const referralCode = body?.referralCode ? String(body.referralCode).trim() : undefined;

		if (planKeyDryRun && !isUpgradeDryRun && isPlanEligibleForReferralDiscount(planKeyDryRun)) {
			if (earnedDiscountCodeId) {
				const earned = await validateEarnedCodeForCheckout(ownerId, earnedDiscountCodeId, planKeyDryRun, galleryPriceCents ?? 0);
				if (!earned.valid) {
					return {
						statusCode: 400,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ error: 'Invalid discount code', message: earned.errorMessage })
					};
				}
				discountCentsDryRun = earned.discountCents ?? 0;
			} else if (referralCode) {
				const ref = await validateReferralCodeForCheckout(ownerId, referralCode, planKeyDryRun, galleryPriceCents ?? 0);
				if (!ref.valid) {
					return {
						statusCode: 400,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ error: 'Invalid referral code', message: ref.errorMessage })
					};
				}
				discountCentsDryRun = ref.discountCents ?? 0;
			}
		}
		totalAmountCents = Math.max(0, totalAmountCents - discountCentsDryRun);

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
		// For upgrades, calculate fee on price difference; for regular payments, calculate on full price
		let stripeFeeCents = 0;
		if (stripeAmountCents > 0) {
			const feeBaseAmount = isUpgradeDryRun ? priceDifferenceCentsDryRun : (galleryPriceCents || 0);
			if (feeBaseAmount > 0) {
				stripeFeeCents = calculateStripeFee(feeBaseAmount);
			}
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
				dryRun: true,
				...(discountCentsDryRun > 0 && { discountCents: discountCentsDryRun })
			})
		};
	}

	// In dry run mode, allow checking even if paid (for UI display purposes)
	// In non-dry-run mode, check if this is an upgrade scenario
	if (isPaid && !dryRun) {
		// Check if this is an upgrade scenario (different plan being selected)
		const currentPlanKey = gallery.plan;
		const requestedPlan = body.plan || gallery.plan;
		
		// If no plan provided or same plan, reject
		if (!requestedPlan || !PRICING_PLANS[requestedPlan as PlanKey]) {
			logger.warn('Payment attempt for already paid gallery without valid plan', { 
				galleryId, 
				isPaid,
				galleryState: gallery.state,
				requestedPlan
			});
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery is already paid' })
			};
		}
		
		// Check if this is an upgrade (different plan with larger storage)
		if (currentPlanKey && currentPlanKey !== requestedPlan) {
			const currentPlan = PRICING_PLANS[currentPlanKey as PlanKey];
			const newPlan = PRICING_PLANS[requestedPlan as PlanKey];
			
			// Only allow upgrade if new plan has larger storage
			if (newPlan && currentPlan && newPlan.storageLimitBytes > currentPlan.storageLimitBytes) {
				// Also check that new plan doesn't have shorter duration than current plan
				if (newPlan.expiryDays < currentPlan.expiryDays) {
					logger.warn('Payment attempt for already paid gallery with shorter duration upgrade', { 
						galleryId, 
						isPaid,
						currentPlan: currentPlanKey,
						requestedPlan,
						currentDurationDays: currentPlan.expiryDays,
						newDurationDays: newPlan.expiryDays
					});
					return {
						statusCode: 400,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ 
							error: 'Invalid upgrade',
							message: 'Cannot upgrade to a plan with shorter duration than current plan'
						})
					};
				}
				
				logger.info('Detected upgrade scenario - will handle as upgrade', {
					galleryId,
					currentPlan: currentPlanKey,
					newPlan: requestedPlan
				});
				// Continue with upgrade logic below (will be handled after plan extraction)
			} else {
				logger.warn('Payment attempt for already paid gallery with invalid upgrade', { 
					galleryId, 
					isPaid,
					currentPlan: currentPlanKey,
					requestedPlan,
					currentStorage: currentPlan?.storageLimitBytes,
					newStorage: newPlan?.storageLimitBytes
				});
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Invalid upgrade',
						message: 'New plan must have larger storage limit than current plan'
					})
				};
			}
		} else {
			// Same plan or no current plan - reject
			logger.warn('Payment attempt for already paid gallery with same plan', { 
				galleryId, 
				isPaid,
				galleryState: gallery.state,
				currentPlan: currentPlanKey,
				requestedPlan
			});
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery is already paid' })
			};
		}
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
		const imagesTable = envProc?.env?.IMAGES_TABLE as string;
		if (!imagesTable) {
			logger?.warn('IMAGES_TABLE not set, skipping recalculation before payment', { galleryId });
		} else {
			const recalcResult = await recalculateStorageInternal(galleryId, galleriesTable, imagesTable, gallery, logger, true);
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
		logger.error('Failed to recalculate storage before payment', {
			error: {
				name: recalcErr?.name,
				message: recalcErr?.message,
				code: recalcErr?.code,
				stack: recalcErr?.stack
			},
			galleryId,
			imagesTable: envProc?.env?.IMAGES_TABLE
		});
		// Use current gallery value - this is acceptable as storage is tracked in real-time
		currentUploadedSize = (gallery.originalsBytesUsed || 0) + (gallery.finalsBytesUsed || 0);
		logger.warn('Using gallery storage values without recalculation', {
			galleryId,
			originalsBytesUsed: gallery.originalsBytesUsed,
			finalsBytesUsed: gallery.finalsBytesUsed,
			currentUploadedSize
		});
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
	
	// Check if this is an upgrade scenario (gallery already paid, different plan selected)
	let isUpgrade = false;
	let priceDifferenceCents = 0;
	let currentPlanKey: string | undefined;
	let newPlanKey: string | undefined;
	
	if (isPaid) {
		currentPlanKey = gallery.plan;
		newPlanKey = body.plan || gallery.plan;
		
		if (currentPlanKey && newPlanKey && currentPlanKey !== newPlanKey) {
			const currentPlan = PRICING_PLANS[currentPlanKey as PlanKey];
			const newPlan = PRICING_PLANS[newPlanKey as PlanKey];
			
			if (currentPlan && newPlan && newPlan.storageLimitBytes > currentPlan.storageLimitBytes) {
				isUpgrade = true;
				const isSelectionGallery = gallery.selectionEnabled !== false;
				const currentPriceCents = calculatePriceWithDiscount(currentPlanKey as PlanKey, isSelectionGallery);
				const newPriceCents = calculatePriceWithDiscount(newPlanKey as PlanKey, isSelectionGallery);
				priceDifferenceCents = newPriceCents - currentPriceCents;
				
				// Update plan and price for upgrade
				plan = newPlanKey;
				galleryPriceCents = newPriceCents;
				
				logger.info('Processing upgrade via pay endpoint', {
					galleryId,
					currentPlan: currentPlanKey,
					newPlan: newPlanKey,
					currentPriceCents,
					newPriceCents,
					priceDifferenceCents
				});
			}
		}
	}
	
	let totalAmountCents = isUpgrade ? priceDifferenceCents : galleryPriceCents;
	const planKeyPay = (plan as string) || '';
	const earnedDiscountCodeIdBody = body?.earnedDiscountCodeId ? String(body.earnedDiscountCodeId).trim() : undefined;
	const referralCodeBody = body?.referralCode ? String(body.referralCode).trim() : undefined;

	type ReferralMeta = { earnedDiscountCodeId: string; discountCents: number; discountType: string } | { referredByUserId: string; referralDiscountCents: number; referredDiscountType: string } | null;
	let referralMetadata: ReferralMeta = null;
	// Apply discount only when creating a new transaction (no existing UNPAID); existing transaction keeps its amount and metadata
	if (!existingTransaction && planKeyPay && !isUpgrade && isPlanEligibleForReferralDiscount(planKeyPay)) {
		if (earnedDiscountCodeIdBody) {
			const earned = await validateEarnedCodeForCheckout(ownerId, earnedDiscountCodeIdBody, planKeyPay, galleryPriceCents);
			if (!earned.valid) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Invalid discount code', message: earned.errorMessage })
				};
			}
			const discountCents = earned.discountCents ?? 0;
			totalAmountCents = Math.max(0, totalAmountCents - discountCents);
			referralMetadata = { earnedDiscountCodeId: earnedDiscountCodeIdBody, discountCents, discountType: earned.type ?? '10_percent' };
		} else if (referralCodeBody) {
			const ref = await validateReferralCodeForCheckout(ownerId, referralCodeBody, planKeyPay, galleryPriceCents);
			if (!ref.valid) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Invalid referral code', message: ref.errorMessage })
				};
			}
			const discountCents = ref.discountCents ?? 0;
			totalAmountCents = Math.max(0, totalAmountCents - discountCents);
			referralMetadata = ref.referrerUserId ? { referredByUserId: ref.referrerUserId, referralDiscountCents: discountCents, referredDiscountType: ref.isTopInviter ? '15_percent' : '10_percent' } : null;
		} else {
			// Linked referrer (user signed up via invite link) – no code required
			const linkedReferrer = await getReferredByUserId(ownerId);
			if (linkedReferrer) {
				const ref = await validateReferrerUserIdForCheckout(ownerId, linkedReferrer, planKeyPay);
				if (ref.valid && ref.referrerUserId != null) {
					const discountCents = ref.discountCents ?? 0;
					totalAmountCents = Math.max(0, totalAmountCents - discountCents);
					referralMetadata = { referredByUserId: ref.referrerUserId, referralDiscountCents: discountCents, referredDiscountType: ref.isTopInviter ? '15_percent' : '10_percent' };
				}
			}
		}
	}

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
			let composites: string[] = [];
			let transactionType: 'GALLERY_PLAN' | 'GALLERY_PLAN_UPGRADE' = 'GALLERY_PLAN';
			let transactionMetadata: any = {};
			
			if (isUpgrade && currentPlanKey && newPlanKey) {
				// Upgrade transaction
				transactionType = 'GALLERY_PLAN_UPGRADE';
				const currentPlan = PRICING_PLANS[currentPlanKey as PlanKey];
				const newPlan = PRICING_PLANS[newPlanKey as PlanKey];
				composites = [
					`Plan Upgrade: ${newPlan?.label || newPlanKey}`,
					`- Already purchased: ${currentPlan?.label || currentPlanKey} (${((galleryPriceCents - priceDifferenceCents) / 100).toFixed(2)} PLN)`,
					`- Upgrade cost: ${(priceDifferenceCents / 100).toFixed(2)} PLN`
				];
				transactionMetadata = {
					plan: newPlanKey,
					previousPlan: currentPlanKey,
					priceDifferenceCents,
					currentPriceCents: galleryPriceCents - priceDifferenceCents,
					newPriceCents: galleryPriceCents
				};
			} else {
				// Regular payment transaction
				composites = [`Gallery Plan ${plan}`];
				const planCalculationTimestamp = gallery.planCalculationTimestamp || new Date().toISOString();
				transactionMetadata = {
					plan,
					priceCents: galleryPriceCents,
					originalsLimitBytes: gallery.originalsLimitBytes,
					finalsLimitBytes: gallery.finalsLimitBytes,
					planCalculationTimestamp,
					// Store original plan details for upgrade calculations later
					originalPlan: plan,
					originalPriceCents: galleryPriceCents,
					originalSelectionEnabled: gallery.selectionEnabled !== false
				};
			}
			if (referralMetadata) {
				transactionMetadata = { ...transactionMetadata, ...referralMetadata };
			}

			// Create transaction with UNPAID status
			const newTransactionId = await createTransaction(
				ownerId,
				transactionType,
				totalAmountCents,
				{
					galleryId,
					walletAmountCents,
					stripeAmountCents,
					paymentMethod: walletAmountCents > 0 ? 'WALLET' : 'STRIPE' as any,
					composites,
					metadata: transactionMetadata
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
				error: {
					name: err?.name,
					message: err?.message,
					code: err?.code,
					stack: err?.stack
				},
				galleryId,
				ownerId,
				totalAmountCents,
				transactionType: isUpgrade ? 'GALLERY_PLAN_UPGRADE' : 'GALLERY_PLAN'
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Failed to create transaction', message: err?.message || 'Unknown error' })
			};
		}
	}

	// Use transaction as source of truth - override calculated values with transaction values
	const transactionId = existingTransaction.transactionId;
	const fullPriceCents = totalAmountCents; // full price before applying any existing-transaction amount
	totalAmountCents = existingTransaction.amountCents;
	plan = existingTransaction.metadata?.plan || plan;

	// Re-validate referral discount on existing transaction: if this transaction has referral metadata
	// but the user has already used their one-time discount (referralDiscountUsedAt set), charge full price
	// and update the transaction record so we don't grant discount twice.
	const existingMeta = existingTransaction.metadata || {};
	if ((existingMeta.referredByUserId || existingMeta.earnedDiscountCodeId) && !isUpgrade) {
		const stillFirstPurchase = await isBuyerFirstGalleryPurchase(ownerId);
		if (!stillFirstPurchase) {
			totalAmountCents = fullPriceCents;
			logger.info('Existing transaction had referral discount but user already used it; charging full price', {
				galleryId,
				transactionId,
				fullPriceCents,
				previousAmountCents: existingTransaction.amountCents
			});
			const metaWithoutReferral: Record<string, unknown> = { ...existingMeta };
			delete metaWithoutReferral.referredByUserId;
			delete metaWithoutReferral.referralDiscountCents;
			delete metaWithoutReferral.referredDiscountType;
			delete metaWithoutReferral.earnedDiscountCodeId;
			delete metaWithoutReferral.discountCents;
			delete metaWithoutReferral.discountType;
			if (transactionsTable) {
				try {
					await ddb.send(new UpdateCommand({
						TableName: transactionsTable,
						Key: { userId: ownerId, transactionId },
						UpdateExpression: 'SET amountCents = :amt, #meta = :meta, updatedAt = :u',
						ExpressionAttributeNames: { '#meta': 'metadata' },
						ExpressionAttributeValues: {
							':amt': fullPriceCents,
							':meta': metaWithoutReferral,
							':u': new Date().toISOString()
						}
					}));
				} catch (updateErr: any) {
					logger.warn('Failed to strip referral metadata from transaction', { transactionId, error: updateErr?.message });
				}
			}
			// Update in-memory transaction so rest of handler does not grant referrer reward or mark discount used
			existingTransaction.amountCents = fullPriceCents;
			existingTransaction.metadata = metaWithoutReferral;
		}
	}

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
			paid = await debitWallet(ownerId, totalAmountCents, walletsTable, ledgerTable, transactionId, false, logger);
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
				// Mark user as having used referral discount (once per user, no transaction list limit)
				const meta = existingTransaction.metadata || {};
				if (meta.referredByUserId || meta.earnedDiscountCodeId) {
					try {
						await markUserReferralDiscountUsed(ownerId);
						logger.info('User marked as referral discount used (wallet path)', { ownerId, galleryId });
					} catch (refErr: any) {
						logger.warn('Failed to mark user referral discount used (wallet path)', { ownerId, error: refErr?.message });
					}
				}

				// Set normal expiry and update gallery state to PAID_ACTIVE
				// CRITICAL: This MUST happen after transaction update to maintain consistency
				const now = new Date().toISOString();
				
				// For upgrades, extend expiry from original plan start date if new plan has longer duration
				// For new payments, calculate new expiry from now
				let expiresAt: string;
				
				// Use plan from transaction metadata if available (for upgrades, this is the new plan)
				// Fall back to newPlanKey or plan variable
				const effectiveNewPlanKey = existingTransaction.metadata?.plan || newPlanKey || plan;
				const effectiveCurrentPlanKey = existingTransaction.metadata?.previousPlan || currentPlanKey || gallery.plan;
				
				if (isUpgrade && gallery.expiresAt && effectiveCurrentPlanKey && effectiveNewPlanKey) {
					const currentPlan = PRICING_PLANS[effectiveCurrentPlanKey as PlanKey];
					const newPlan = PRICING_PLANS[effectiveNewPlanKey as PlanKey];
					
					logger.info('Checking expiry extension for upgrade', {
						galleryId,
						isUpgrade,
						hasExpiresAt: !!gallery.expiresAt,
						effectiveCurrentPlanKey,
						effectiveNewPlanKey,
						currentPlanExists: !!currentPlan,
						newPlanExists: !!newPlan,
						currentPlanExpiryDays: currentPlan?.expiryDays,
						newPlanExpiryDays: newPlan?.expiryDays,
						currentExpiry: gallery.expiresAt
					});
					
					if (currentPlan && newPlan && newPlan.expiryDays > currentPlan.expiryDays) {
						// Calculate original plan start date from current expiry and plan duration
						const currentExpiresAt = new Date(gallery.expiresAt);
						const originalStartDate = new Date(currentExpiresAt.getTime() - currentPlan.expiryDays * 24 * 60 * 60 * 1000);
						
						// Extend expiry from original start date using new plan duration
						const newExpiresAtDate = new Date(originalStartDate.getTime() + newPlan.expiryDays * 24 * 60 * 60 * 1000);
						expiresAt = newExpiresAtDate.toISOString();
						
						logger.info('Upgrade detected - extending expiry from original start date', { 
							galleryId, 
							currentPlan: effectiveCurrentPlanKey,
							newPlan: effectiveNewPlanKey,
							originalStartDate: originalStartDate.toISOString(),
							originalExpiry: gallery.expiresAt,
							newExpiry: expiresAt,
							currentDurationDays: currentPlan.expiryDays,
							newDurationDays: newPlan.expiryDays
						});
					} else {
						// Same or shorter duration - keep original expiry date
						expiresAt = gallery.expiresAt;
						logger.info('Upgrade detected - keeping original expiry date (same or shorter duration)', { 
							galleryId, 
							currentPlan: effectiveCurrentPlanKey,
							newPlan: effectiveNewPlanKey,
							currentPlanExpiryDays: currentPlan?.expiryDays,
							newPlanExpiryDays: newPlan?.expiryDays,
							expiresAt 
						});
					}
				} else {
					// Calculate new expiry for new payments
					const expiresAtDate = new Date(new Date(now).getTime() + expiryDays * 24 * 60 * 60 * 1000);
					expiresAt = expiresAtDate.toISOString();
					logger.info('Not an upgrade or missing data - calculating expiry from now', {
						galleryId,
						isUpgrade,
						hasExpiresAt: !!gallery.expiresAt,
						effectiveCurrentPlanKey,
						effectiveNewPlanKey,
						expiryDays,
						expiresAt
					});
				}
				
				// Cancel old EventBridge schedule (if exists) and create new one for paid expiry
				const oldScheduleName = gallery.expiryScheduleName || getScheduleName(galleryId);
				const deletionLambdaArn = envProc?.env?.GALLERY_EXPIRY_DELETION_LAMBDA_ARN as string;
				const scheduleRoleArn = envProc?.env?.GALLERY_EXPIRY_SCHEDULE_ROLE_ARN as string;
				const dlqArn = envProc?.env?.GALLERY_EXPIRY_DLQ_ARN as string;
				
				let newScheduleName: string | undefined;
				if (deletionLambdaArn && scheduleRoleArn) {
					try {
						// Cancel old schedule (idempotent - won't fail if doesn't exist)
						await cancelExpirySchedule(oldScheduleName, logger);
						logger.info('Canceled old EventBridge schedule', { galleryId, oldScheduleName });
						
						// Create new schedule for paid expiry
						newScheduleName = await createExpirySchedule(galleryId, expiresAt, deletionLambdaArn, scheduleRoleArn, dlqArn, logger);
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
				// For upgrades, also update plan, price, and storage limits
				let updateExpr: string;
				const exprValues: any = {
					':s': 'PAID_ACTIVE',
					':ss': gallery.selectionEnabled ? 'NOT_STARTED' : 'DISABLED',
					':u': now
				};
				const exprNames: any = {
					'#state': 'state'
				};
				
				if (isUpgrade && newPlanKey) {
					// Upgrade: update plan, price, storage limits, and expiry (if extended)
					const newPlan = PRICING_PLANS[newPlanKey as PlanKey];
					if (newPlan) {
						// Include expiresAt in update if it changed (longer duration upgrade)
						const expiresAtChanged = expiresAt !== gallery.expiresAt;
						
						if (expiresAtChanged) {
							// Expiry was extended - include it in update
							updateExpr = newScheduleName
								? 'SET #state = :s, #plan = :p, priceCents = :price, originalsLimitBytes = :olb, finalsLimitBytes = :flb, expiresAt = :e, expiryScheduleName = :sn, selectionStatus = :ss, updatedAt = :u REMOVE paymentLocked'
								: 'SET #state = :s, #plan = :p, priceCents = :price, originalsLimitBytes = :olb, finalsLimitBytes = :flb, expiresAt = :e, selectionStatus = :ss, updatedAt = :u REMOVE paymentLocked';
							exprValues[':e'] = expiresAt;
						} else {
							// Expiry unchanged - don't include it
							updateExpr = newScheduleName
								? 'SET #state = :s, #plan = :p, priceCents = :price, originalsLimitBytes = :olb, finalsLimitBytes = :flb, expiryScheduleName = :sn, selectionStatus = :ss, updatedAt = :u REMOVE paymentLocked'
								: 'SET #state = :s, #plan = :p, priceCents = :price, originalsLimitBytes = :olb, finalsLimitBytes = :flb, selectionStatus = :ss, updatedAt = :u REMOVE paymentLocked';
						}
						
						exprValues[':p'] = newPlanKey;
						exprValues[':price'] = galleryPriceCents;
						exprValues[':olb'] = newPlan.storageLimitBytes;
						exprValues[':flb'] = newPlan.storageLimitBytes;
						exprNames['#plan'] = 'plan';
						if (newScheduleName) {
							exprValues[':sn'] = newScheduleName;
						}
						logger.info('Upgrade: updating plan, storage limits, and expiry', { 
							galleryId, 
							newPlan: newPlanKey, 
							newPrice: galleryPriceCents,
							newStorage: newPlan.storageLimitBytes,
							expiresAtChanged,
							oldExpiry: gallery.expiresAt,
							newExpiry: expiresAtChanged ? expiresAt : gallery.expiresAt
						});
					} else {
						// Fallback to regular update if plan not found
						updateExpr = newScheduleName
							? 'SET #state = :s, expiresAt = :e, expiryScheduleName = :sn, selectionStatus = :ss, updatedAt = :u REMOVE paymentLocked'
							: 'SET #state = :s, expiresAt = :e, selectionStatus = :ss, updatedAt = :u REMOVE paymentLocked';
						exprValues[':e'] = expiresAt;
						if (newScheduleName) {
							exprValues[':sn'] = newScheduleName;
						}
					}
				} else {
					// Regular payment: update state and expiry
					updateExpr = newScheduleName
						? 'SET #state = :s, expiresAt = :e, expiryScheduleName = :sn, selectionStatus = :ss, updatedAt = :u REMOVE paymentLocked'
						: 'SET #state = :s, expiresAt = :e, selectionStatus = :ss, updatedAt = :u REMOVE paymentLocked';
					exprValues[':e'] = expiresAt;
					if (newScheduleName) {
						exprValues[':sn'] = newScheduleName;
					}
				}
				
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: updateExpr,
					ExpressionAttributeNames: exprNames,
					ExpressionAttributeValues: exprValues
				}));
				logger.info('Gallery state updated to PAID_ACTIVE', { galleryId, expiresAt, scheduleName: newScheduleName, isUpgrade });
				
				logger.info('Gallery paid via wallet, state updated to PAID_ACTIVE', {
					galleryId,
					transactionId,
					expiresAt,
					scheduleName: newScheduleName
				});

				// Referral: mark earned code used and grant referrer reward (same as webhook path)
				const txnMeta = existingTransaction?.metadata || {};
				if (txnMeta.earnedDiscountCodeId) {
					try {
						await markEarnedCodeUsed(ownerId, txnMeta.earnedDiscountCodeId, galleryId);
						logger.info('Marked earned discount code as used (wallet path)', { galleryId, codeId: txnMeta.earnedDiscountCodeId });
					} catch (refErr: any) {
						logger.warn('Failed to mark earned code used (wallet path)', { galleryId, error: refErr?.message });
					}
				}
				let referrerRewardGranted: { rewardType: '10_percent' | 'free_small' | '15_percent' | 'wallet_20pln' } | null = null;
				if (txnMeta.referredByUserId) {
					try {
						const { granted, rewardType, walletCreditCents } = await grantReferrerRewardForPurchase(txnMeta.referredByUserId, galleryId, ownerId);
						if (granted) {
							logger.info('Granted referrer reward (wallet path)', { galleryId, referrerUserId: txnMeta.referredByUserId });
							if (rewardType) referrerRewardGranted = { rewardType };
							if (walletCreditCents && walletsTable && ledgerTable) {
								const refId = `referral_bonus_${txnMeta.referredByUserId}_${galleryId}`;
								const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
								try {
									// Create transaction entry for referral bonus
									if (transactionsTable) {
										try {
											const txnId = await createTransaction(txnMeta.referredByUserId, 'REFERRAL_BONUS', walletCreditCents, {
												walletAmountCents: walletCreditCents,
												stripeAmountCents: 0,
												paymentMethod: 'WALLET',
												refId,
												metadata: {
													bonusType: '10TH_REFERRAL',
													referredUserId: ownerId,
													galleryId
												},
												composites: ['10th Referral Bonus - 20 PLN']
											});
											
											// Mark transaction as PAID immediately
											await updateTransactionStatus(txnMeta.referredByUserId, txnId, 'PAID');
											logger.info('Referral bonus transaction created (wallet path)', { referrerUserId: txnMeta.referredByUserId, transactionId: txnId, amountCents: walletCreditCents });
										} catch (txnErr: any) {
											logger.warn('Failed to create referral bonus transaction (wallet path)', { referrerUserId: txnMeta.referredByUserId, error: txnErr?.message });
											// Continue to credit wallet even if transaction creation fails
										}
									}
									
									const newBalance = await creditWalletLib(txnMeta.referredByUserId, walletCreditCents, refId, walletsTable, ledgerTable, 'REFERRAL_BONUS');
									if (newBalance != null) {
										logger.info('Referrer 10+ wallet credit applied (wallet path)', { referrerUserId: txnMeta.referredByUserId, amountCents: walletCreditCents, newBalance });
									}
								} catch (walletErr: any) {
									logger.warn('Failed to credit referrer wallet (wallet path)', { referrerUserId: txnMeta.referredByUserId, error: walletErr?.message });
								}
							}
						}
					} catch (refErr: any) {
						logger.warn('Failed to grant referrer reward (wallet path)', { galleryId, error: refErr?.message });
					}
				}
				// Eligibility email is sent only after first Stripe payment (see webhook); wallet-only path does not trigger it.
				// Referrer reward email
				if (referrerRewardGranted && txnMeta.referredByUserId) {
					try {
						const toEmail = await getEmailForUser(txnMeta.referredByUserId);
						const sender = await getSenderEmail();
						if (toEmail && sender) {
							const dashboardUrl = await getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' });
							const template = createReferrerRewardEmail({ rewardType: referrerRewardGranted.rewardType, dashboardUrl });
							await sendRawEmailWithAttachments({ to: toEmail, from: sender, subject: template.subject, html: template.html || template.text, attachments: [] });
							logger.info('Referrer reward email sent (wallet path)', { referrerUserId: txnMeta.referredByUserId });
						}
					} catch (refEmailErr: any) {
						logger.warn('Referrer reward email failed (wallet path)', { error: refEmailErr?.message });
					}
				}
				
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
			logger.error('Wallet payment failed but no Stripe fallback available', {
				galleryId,
				transactionId,
				totalAmountCents,
				walletBalance,
				paid
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Wallet payment failed. Please try again or contact support.' })
			};
			}

		// If not fully paid with wallet, create Stripe checkout
		if (!stripeSecretKey) {
			logger.error('Stripe not configured and wallet payment failed', {
				galleryId,
				transactionId,
				totalAmountCents,
				walletBalance,
				paid
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Stripe not configured and wallet payment failed' })
			};
		}

		logger.info('Creating Stripe checkout session', {
			galleryId,
			transactionId,
			totalAmountCents,
			stripeAmountCents,
			walletAmountCents,
			isUpgrade
		});

		try {
			const stripe = new Stripe(stripeSecretKey);
		const dashboardUrl = await getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' });
		// ALWAYS use redirectUrl from request body if provided (this is the primary method)
		// Fallback to default only if redirectUrl is not provided
		let finalRedirectUrl = redirectUrl;
		if (!finalRedirectUrl) {
			// Log warning if redirectUrl is missing - this should not happen in normal flow
			logger.warn('redirectUrl not provided in request, using default', { galleryId });
			finalRedirectUrl = `${dashboardUrl}/galleries/${galleryId}?payment=success`;
		}
		
		const successUrl = `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`;
		// Cancel URL should also redirect back to gallery view
		const cancelUrl = `${apiUrl}/payments/cancel?session_id={CHECKOUT_SESSION_ID}&transactionId=${transactionId}&userId=${ownerId}`;

		// USER-CENTRIC FIX: Add Stripe fees to gallery payments (user pays fees)
		// For wallet top-ups, PixiProof covers fees (handled in checkoutCreate.ts)
		// For gallery payments, user pays fees (we add fees to the amount charged)
		// IMPORTANT: For upgrades, calculate fee on price difference; for regular payments, calculate on full plan price
		// Example: Upgrade from 7 PLN to 10 PLN (3 PLN difference), Stripe should charge 3 PLN + fee calculated on 3 PLN
		// Example: Plan is 7 PLN, wallet covers 2 PLN, Stripe should charge 5 PLN + fee calculated on 7 PLN
		const feeBaseAmount = isUpgrade ? priceDifferenceCents : galleryPriceCents;
		const stripeFeeCents = stripeAmountCents > 0 ? calculateStripeFee(feeBaseAmount) : 0;
		const totalChargeAmountCents = stripeAmountCents + stripeFeeCents;
		
		// Build line items from transaction
		const lineItems: any[] = [];
		
		// Gallery plan line item
		// Show the portion being paid via Stripe (stripeAmountCents), but the description mentions the full plan price
		if (galleryPriceCents > 0 && stripeAmountCents > 0) {
			if (isUpgrade && currentPlanKey && newPlanKey) {
				// Upgrade: show upgrade breakdown
				const currentPlan = PRICING_PLANS[currentPlanKey as PlanKey];
				const newPlan = PRICING_PLANS[newPlanKey as PlanKey];
				const currentPriceCents = galleryPriceCents - priceDifferenceCents;
				
				lineItems.push({
					price_data: {
						currency: 'pln',
						product_data: {
							name: `Plan Upgrade: ${newPlan?.label || newPlanKey}`,
							description: walletAmountCents > 0
								? `Already purchased: ${currentPlan?.label || currentPlanKey} (${(currentPriceCents / 100).toFixed(2)} PLN)\nUpgrade cost: ${(priceDifferenceCents / 100).toFixed(2)} PLN (${(walletAmountCents / 100).toFixed(2)} PLN from wallet)`
								: `Already purchased: ${currentPlan?.label || currentPlanKey} (${(currentPriceCents / 100).toFixed(2)} PLN)\nUpgrade cost: ${(priceDifferenceCents / 100).toFixed(2)} PLN`
						},
						unit_amount: stripeAmountCents
					},
					quantity: 1
				});
			} else {
				// Regular payment
				lineItems.push({
					price_data: {
						currency: 'pln',
						product_data: {
							name: `Gallery: ${galleryId}`,
							description: walletAmountCents > 0
								? `PixiProof gallery payment - ${plan} plan (${(galleryPriceCents / 100).toFixed(2)} PLN total, ${(walletAmountCents / 100).toFixed(2)} PLN from wallet)`
								: `PixiProof gallery payment - ${plan} plan`
						},
						unit_amount: stripeAmountCents
					},
					quantity: 1
				});
			}
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
		
		// For upgrades, store plan info in session metadata (don't update gallery until payment succeeds)
		// This prevents free upgrades if user closes browser without completing payment
		const existingMeta = existingTransaction?.metadata || {};
		const session = await createStripeCheckoutSession(stripe, {
			lineItems,
			successUrl,
			cancelUrl,
			metadata: {
				userId: ownerId,
				type: isUpgrade ? 'gallery_plan_upgrade' : 'gallery_payment',
				galleryId,
				transactionId: transactionId,
				walletAmountCents: walletAmountCents.toString(),
				stripeAmountCents: stripeAmountCents.toString(),
				redirectUrl: finalRedirectUrl,
				...(isUpgrade && newPlanKey && currentPlanKey ? {
					plan: newPlanKey,
					previousPlan: currentPlanKey,
					newPriceCents: galleryPriceCents.toString()
				} : {}),
				...(existingMeta.earnedDiscountCodeId && { earnedDiscountCodeId: existingMeta.earnedDiscountCodeId })
			},
			mode: 'payment'
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
				name: err?.name,
				message: err?.message,
				code: err?.code,
				type: err?.type,
				stack: err?.stack
			},
			galleryId,
			transactionId,
			stripeAmountCents,
			walletAmountCents,
			totalAmountCents
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to create checkout session', message: err?.message || 'Unknown error' })
		};
	}
	} catch (err: any) {
		// Top-level error handler for any unhandled errors
		const errorMessage = err?.message || err?.toString() || 'Unknown error';
		const errorName = err?.name || 'UnknownError';
		const errorStack = err?.stack || 'No stack trace';
		
		logger.error('Unhandled error in pay endpoint handler', {
			error: {
				name: errorName,
				message: errorMessage,
				stack: errorStack,
				code: err?.code,
				type: err?.type,
				statusCode: err?.statusCode,
			},
			galleryId: event?.pathParameters?.id,
			httpMethod: event?.httpMethod,
			path: event?.path,
			requestId: context?.awsRequestId,
		});
		
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Internal server error', 
				message: 'An unexpected error occurred' 
			})
		};
	}
});

