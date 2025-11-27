import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery, createTransaction } from '../../lib/src/transactions';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PRICING_PLANS, calculatePriceWithDiscount, type PlanKey } from '../../lib/src/pricing';

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
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const apiUrl = envProc?.env?.PUBLIC_API_URL as string || '';

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
	const forceStripeOnly = body?.forceStripeOnly === true;

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

	// Calculate wallet vs stripe amounts
	let walletAmountCents = 0;
	let stripeAmountCents = priceDifferenceCents;

	if (forceStripeOnly) {
		walletAmountCents = 0;
		stripeAmountCents = priceDifferenceCents;
	} else if (walletsTable && ledgerTable) {
		const walletBalance = await getWalletBalance(requester, walletsTable);
		if (walletBalance >= priceDifferenceCents) {
			walletAmountCents = priceDifferenceCents;
			stripeAmountCents = 0;
		} else if (walletBalance > 0) {
			walletAmountCents = walletBalance;
			stripeAmountCents = priceDifferenceCents - walletBalance;
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
			paymentMethod: walletAmountCents > 0 && stripeAmountCents > 0 ? 'MIXED' : walletAmountCents > 0 ? 'WALLET' : 'STRIPE' as any,
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
				const { updateTransactionStatus } = await import('../../lib/src/transactions');
				await updateTransactionStatus(requester, transactionId, 'PAID', {});

				// USER-CENTRIC FIX #7: Keep original expiry date, only upgrade storage size
				// User paid for original duration, upgrade should not extend it
				// Only update plan, price, and storage limits - keep expiresAt unchanged
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET #plan = :plan, priceCents = :price, originalsLimitBytes = :olb, finalsLimitBytes = :flb, updatedAt = :u',
					ExpressionAttributeNames: {
						'#plan': 'plan'
					},
					ExpressionAttributeValues: {
						':plan': newPlanKey,
						':price': newPriceCents,
						':olb': newPlan.storageLimitBytes,
						':flb': newPlan.storageLimitBytes,
						':u': now
						// Note: expiresAt is NOT updated - keeps original expiry date
					}
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
	if (stripeAmountCents > 0 && stripeSecretKey && apiUrl) {
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

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: lineItems,
			mode: 'payment',
			success_url: `${apiUrl}/dashboard/galleries/${galleryId}?upgrade=success`,
			cancel_url: `${apiUrl}/dashboard/galleries/${galleryId}?upgrade=cancelled`,
			metadata: {
				galleryId,
				transactionId,
				type: 'gallery_plan_upgrade',
				plan: newPlanKey,
				previousPlan: currentPlanKey,
				priceDifferenceCents: priceDifferenceCents.toString(),
				currentPriceCents: currentPriceCents.toString(),
				newPriceCents: newPriceCents.toString(),
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

