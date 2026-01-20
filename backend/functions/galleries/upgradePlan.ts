import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery, createTransaction, updateTransactionStatus } from '../../lib/src/transactions';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PRICING_PLANS, calculatePriceWithDiscount, type PlanKey } from '../../lib/src/pricing';
import { cancelExpirySchedule, createExpirySchedule, getScheduleName } from '../../lib/src/expiry-scheduler';
import { getStripeSecretKey } from '../../lib/src/stripe-config';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

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

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;

	let apiUrl: string;
	try {
		apiUrl = await getRequiredConfigValue(stage, 'PublicApiUrl', { envVarName: 'PUBLIC_API_URL' });
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing configuration', message: error.message })
		};
	}

	if (!galleriesTable || !transactionsTable) {
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

	const body = event?.body ? JSON.parse(event.body) : {};
	const newPlanKey = body?.plan;
	const redirectUrl = body?.redirectUrl;

	if (!newPlanKey || !PRICING_PLANS[newPlanKey]) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Invalid plan. Must be one of: ' + Object.keys(PRICING_PLANS).join(', ') })
		};
	}

	const requester = getUserIdFromEvent(event);
	const galleryGet = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = galleryGet.Item as any;

	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}

	requireOwnerOr403(gallery.ownerId, requester);

	// Verify gallery is already paid
	const paidTransaction = await getPaidTransactionForGallery(galleryId);
	if (!paidTransaction) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Gallery is not paid',
				message: 'Use /galleries/:id/pay endpoint for initial payment'
			})
		};
	}

	// Get current plan
	const currentPlanKey = gallery.plan;
	if (!currentPlanKey || !PRICING_PLANS[currentPlanKey]) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Current gallery plan is invalid or missing' })
		};
	}

	// Check if upgrading to same or smaller plan
	const currentPlan = PRICING_PLANS[currentPlanKey];
	const newPlan = PRICING_PLANS[newPlanKey];
	
	if (newPlan.storageLimitBytes <= currentPlan.storageLimitBytes) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Invalid upgrade',
				message: 'New plan must have larger storage limit than current plan'
			})
		};
	}

	// Calculate price difference
	const isSelectionGallery = gallery.selectionEnabled !== false;
	const currentPriceCents = calculatePriceWithDiscount(currentPlanKey, isSelectionGallery);
	const newPriceCents = calculatePriceWithDiscount(newPlanKey, isSelectionGallery);

	const priceDifferenceCents = newPriceCents - currentPriceCents;

	if (priceDifferenceCents <= 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Invalid upgrade',
				message: 'New plan price must be higher than current plan price'
			})
		};
	}

	// Calculate wallet vs stripe amounts - use full wallet if sufficient, otherwise full Stripe (no partial payments)
	let walletAmountCents = 0;
	let stripeAmountCents = priceDifferenceCents;

	if (walletsTable && ledgerTable) {
		const walletBalance = await getWalletBalance(requester, walletsTable);
		if (walletBalance >= priceDifferenceCents) {
			walletAmountCents = priceDifferenceCents;
			stripeAmountCents = 0;
		} else {
			// Insufficient wallet balance - use full Stripe payment
			walletAmountCents = 0;
			stripeAmountCents = priceDifferenceCents;
		}
	}

	// Create transaction for upgrade (difference only)
	const composites: string[] = [
		`Plan Upgrade: ${newPlan.label}`,
		`- Already purchased: ${currentPlan.label} (${(currentPriceCents / 100).toFixed(2)} PLN)`,
		`- Upgrade cost: ${(priceDifferenceCents / 100).toFixed(2)} PLN`
	];

	const transactionId = await createTransaction(
		requester,
		'GALLERY_PLAN_UPGRADE',
		priceDifferenceCents,
		{
			galleryId,
			walletAmountCents,
			stripeAmountCents,
					paymentMethod: walletAmountCents > 0 ? 'WALLET' : 'STRIPE' as any,
			composites,
			metadata: {
				plan: newPlanKey,
				previousPlan: currentPlanKey,
				priceDifferenceCents,
				currentPriceCents,
				newPriceCents
			}
		}
	);

	logger.info('Upgrade transaction created', { 
		transactionId, 
		galleryId, 
		currentPlan: currentPlanKey,
		newPlan: newPlanKey,
		priceDifferenceCents 
	});

	// If wallet covers full amount, process immediately
	if (walletAmountCents === priceDifferenceCents && walletsTable && ledgerTable) {
		const now = new Date().toISOString();
		try {
			const walletGet = await ddb.send(new GetCommand({
				TableName: walletsTable,
				Key: { userId: requester }
			}));
			
			const currentBalance = walletGet.Item?.balanceCents || 0;
			if (currentBalance >= walletAmountCents) {
				const newBalance = currentBalance - walletAmountCents;
				await ddb.send(new UpdateCommand({
					TableName: walletsTable,
					Key: { userId: requester },
					UpdateExpression: 'SET balanceCents = :b, updatedAt = :u',
					ConditionExpression: 'attribute_exists(userId) AND balanceCents >= :amount',
					ExpressionAttributeValues: {
						':b': newBalance,
						':amount': walletAmountCents,
						':u': now
					}
				}));

				// Create ledger entry
				await ddb.send(new PutCommand({
					TableName: ledgerTable,
					Item: {
						userId: requester,
						txnId: transactionId,
						type: 'DEBIT',
						amountCents: -walletAmountCents,
						refId: transactionId,
						createdAt: now
					}
				}));

				// Update transaction status
				await updateTransactionStatus(requester, transactionId, 'PAID', {});

				// Calculate expiry date extension from original plan start date if new plan has longer duration
				let expiresAt = gallery.expiresAt;
				let newScheduleName: string | undefined;
				
				if (newPlan.expiryDays > currentPlan.expiryDays && gallery.expiresAt) {
					// Calculate original plan start date from current expiry and plan duration
					const currentExpiresAt = new Date(gallery.expiresAt);
					const originalStartDate = new Date(currentExpiresAt.getTime() - currentPlan.expiryDays * 24 * 60 * 60 * 1000);
					
					// Extend expiry from original start date using new plan duration
					const newExpiresAtDate = new Date(originalStartDate.getTime() + newPlan.expiryDays * 24 * 60 * 60 * 1000);
					expiresAt = newExpiresAtDate.toISOString();
					
					logger.info('Upgrade detected - extending expiry from original start date', {
						galleryId,
						currentPlan: currentPlanKey,
						newPlan: newPlanKey,
						originalStartDate: originalStartDate.toISOString(),
						originalExpiry: gallery.expiresAt,
						newExpiry: expiresAt,
						currentDurationDays: currentPlan.expiryDays,
						newDurationDays: newPlan.expiryDays
					});
					
					// Update EventBridge schedule for new expiry date
					const deletionLambdaArn = envProc?.env?.GALLERY_EXPIRY_DELETION_LAMBDA_ARN as string;
					const scheduleRoleArn = envProc?.env?.GALLERY_EXPIRY_SCHEDULE_ROLE_ARN as string;
					const dlqArn = envProc?.env?.GALLERY_EXPIRY_DLQ_ARN as string;
					
					if (deletionLambdaArn && scheduleRoleArn) {
						try {
							const oldScheduleName = gallery.expiryScheduleName || getScheduleName(galleryId);
							await cancelExpirySchedule(oldScheduleName, logger);
							logger.info('Canceled old EventBridge schedule', { galleryId, oldScheduleName });
							
							newScheduleName = await createExpirySchedule(galleryId, expiresAt, deletionLambdaArn, scheduleRoleArn, dlqArn, logger);
							logger.info('Created new EventBridge schedule for upgraded gallery', { galleryId, scheduleName: newScheduleName, expiresAt });
						} catch (scheduleErr: any) {
							logger.error('Failed to update EventBridge schedule for upgraded gallery', {
								error: {
									name: scheduleErr.name,
									message: scheduleErr.message
								},
								galleryId,
								expiresAt
							});
							// Continue even if schedule update fails
						}
					}
				} else {
					logger.info('Upgrade detected - keeping original expiry date (same or shorter duration)', {
						galleryId,
						currentPlan: currentPlanKey,
						newPlan: newPlanKey,
						expiresAt
					});
				}
				
				// Update gallery with new plan, price, storage limits, and expiry (if extended)
				const updateExpr = expiresAt !== gallery.expiresAt
					? (newScheduleName
						? 'SET #plan = :plan, priceCents = :price, originalsLimitBytes = :olb, finalsLimitBytes = :flb, expiresAt = :e, expiryScheduleName = :sn, updatedAt = :u'
						: 'SET #plan = :plan, priceCents = :price, originalsLimitBytes = :olb, finalsLimitBytes = :flb, expiresAt = :e, updatedAt = :u')
					: 'SET #plan = :plan, priceCents = :price, originalsLimitBytes = :olb, finalsLimitBytes = :flb, updatedAt = :u';
				
				const exprValues: any = {
					':plan': newPlanKey,
					':price': newPriceCents,
					':olb': newPlan.storageLimitBytes,
					':flb': newPlan.storageLimitBytes,
					':u': now
				};
				
				if (expiresAt !== gallery.expiresAt) {
					exprValues[':e'] = expiresAt;
					if (newScheduleName) {
						exprValues[':sn'] = newScheduleName;
					}
				}
				
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: updateExpr,
					ExpressionAttributeNames: {
						'#plan': 'plan'
					},
					ExpressionAttributeValues: exprValues
				}));

				return {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						paid: true,
						transactionId,
						message: 'Plan upgraded successfully',
						newPlan: newPlanKey,
						priceDifferenceCents
					})
				};
			}
		} catch (err: any) {
			logger.error('Failed to process wallet payment for upgrade', {
				error: err.message,
				galleryId,
				transactionId
			});
			// Fall through to Stripe checkout
			walletAmountCents = 0;
			stripeAmountCents = priceDifferenceCents;
		}
	}

	/**
	 * Calculate Stripe processing fees for PLN payments
	 * Stripe fees: ~1.4% + 1 PLN for domestic cards, ~2.9% + 1 PLN for international cards
	 * We use a conservative estimate: 2.9% + 1 PLN to ensure we cover fees
	 */
	function calculateStripeFee(amountCents: number): number {
		const feePercentage = 0.029; // 2.9%
		const fixedFeeCents = 100; // 1 PLN
		const percentageFee = Math.ceil(amountCents * feePercentage);
		return percentageFee + fixedFeeCents;
	}

	// USER-CENTRIC FIX: Add Stripe fees to upgrade payments (user pays fees)
	// IMPORTANT: Calculate fee on FULL price difference (priceDifferenceCents), not on stripeAmountCents
	// This ensures the fee is calculated correctly on the full upgrade cost, not on the reduced amount after wallet deduction
	const stripeFeeCents = stripeAmountCents > 0 ? calculateStripeFee(priceDifferenceCents) : 0;

	// Create Stripe checkout session if needed
	let checkoutUrl: string | undefined;
	if (stripeAmountCents > 0 && apiUrl) {
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
		
		const Stripe = require('stripe');
		const stripe = new Stripe(stripeSecretKey);

		const lineItems: any[] = [{
			price_data: {
				currency: 'pln',
				product_data: {
					name: `Plan Upgrade: ${newPlan.label}`,
					description: `Upgrade from ${currentPlan.label} to ${newPlan.label}. Already purchased: ${(currentPriceCents / 100).toFixed(2)} PLN. Upgrade cost: ${(priceDifferenceCents / 100).toFixed(2)} PLN.`,
				},
				unit_amount: stripeAmountCents,
			},
			quantity: 1,
		}];
		
		// Add Stripe processing fee as separate line item (user pays fees)
		if (stripeFeeCents > 0) {
			lineItems.push({
				price_data: {
					currency: 'pln',
					product_data: {
						name: 'Opłata za przetwarzanie płatności',
						description: 'Stripe processing fee'
					},
					unit_amount: stripeFeeCents
				},
				quantity: 1
			});
		}

		const dashboardUrl = await getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' });
		const successUrl = `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`;
		const cancelUrl = `${apiUrl}/payments/cancel?session_id={CHECKOUT_SESSION_ID}`;

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: lineItems,
			mode: 'payment',
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: {
				userId: requester,
				galleryId,
				transactionId,
				type: 'gallery_plan_upgrade',
				plan: newPlanKey,
				previousPlan: currentPlanKey,
				priceDifferenceCents: priceDifferenceCents.toString(),
				currentPriceCents: currentPriceCents.toString(),
				newPriceCents: newPriceCents.toString(),
				// ALWAYS use redirectUrl from request if provided (this is the primary method)
				// Fallback to default only if redirectUrl is not provided
				redirectUrl: redirectUrl || `${dashboardUrl}/galleries/${galleryId}?upgrade=success`,
			},
		});

		checkoutUrl = session.url;
		logger.info('Stripe checkout session created for upgrade', { 
			sessionId: session.id, 
			galleryId,
			transactionId 
		});
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			paid: walletAmountCents === priceDifferenceCents,
			checkoutUrl,
			transactionId,
			totalAmountCents: priceDifferenceCents,
			walletAmountCents,
			stripeAmountCents,
			currentPlan: currentPlanKey,
			newPlan: newPlanKey,
			currentPriceCents,
			newPriceCents,
			priceDifferenceCents,
			message: walletAmountCents === priceDifferenceCents 
				? 'Plan upgraded successfully' 
				: 'Please complete payment to upgrade plan'
		})
	};
});

