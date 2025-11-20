import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery, listTransactionsByUser, updateTransactionStatus } from '../../lib/src/transactions';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const apiUrl = envProc?.env?.PUBLIC_API_URL as string || '';

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

	// Check if gallery is already paid (from transactions)
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	let isPaid = false;
	if (transactionsTable) {
		try {
			const paidTransaction = await getPaidTransactionForGallery(galleryId);
			isPaid = !!paidTransaction;
		} catch (err) {
			// Fall back to gallery state
			isPaid = gallery.state === 'PAID_ACTIVE';
		}
	} else {
		isPaid = gallery.state === 'PAID_ACTIVE';
	}

	if (isPaid) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery is already paid' })
		};
	}

	// Find existing UNPAID transaction for this gallery
	let existingTransaction = null;
	if (transactionsTable) {
		try {
			const transactions = await listTransactionsByUser(ownerId, {
				type: 'GALLERY_PLAN',
				status: 'UNPAID'
			});
			existingTransaction = transactions.find((tx: any) => tx.galleryId === galleryId);
		} catch (err) {
			logger.warn('Failed to query transactions, will create new transaction', { error: err });
		}
	}

	if (!existingTransaction) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'No unpaid transaction found for this gallery' })
		};
	}

	// Use transaction as source of truth - get all amounts from transaction
	const transactionId = existingTransaction.transactionId;
	const totalAmountCents = existingTransaction.amountCents;
	const walletAmountCents = existingTransaction.walletAmountCents || 0;
	const stripeAmountCents = existingTransaction.stripeAmountCents || totalAmountCents;
	const plan = existingTransaction.metadata?.plan || gallery.plan || 'Small';
	const hasBackupStorage = existingTransaction.metadata?.hasBackupStorage === true || existingTransaction.metadata?.hasBackupStorage === 'true';
	const addonPriceCents = existingTransaction.metadata?.addonPriceCents ? parseInt(existingTransaction.metadata.addonPriceCents) : 0;
	const galleryPriceCents = totalAmountCents - addonPriceCents;

	logger.info('Creating payment checkout for gallery', {
		galleryId,
		transactionId,
		totalAmountCents,
		galleryPriceCents,
		addonPriceCents,
		walletAmountCents,
		stripeAmountCents,
		plan,
		hasBackupStorage,
		currentState: gallery.state
	});

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

		// Update existing transaction with Stripe session ID if it exists
		if (transactionId && transactionsTable) {
			try {
				await updateTransactionStatus(ownerId, transactionId, 'UNPAID', {
					stripeSessionId: session.id
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

