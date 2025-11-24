import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery, listTransactionsByUser, updateTransactionStatus } from '../../lib/src/transactions';
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

async function debitWallet(userId: string, amountCents: number, walletsTable: string, ledgerTable: string, transactionId: string): Promise<boolean> {
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

			await ddb.send(new UpdateCommand({
				TableName: ledgerTable,
				Key: { userId, txnId: transactionId },
				UpdateExpression: 'SET type = :t, amountCents = :a, refId = :r, createdAt = :c',
				ExpressionAttributeValues: {
					':t': 'DEBIT',
					':a': -amountCents,
					':r': transactionId,
					':c': now
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
			body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
		}
	} catch (err) {
		logger.warn('Failed to parse request body', { error: err });
	}
	const dryRun = body.dryRun === true;

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

	if (isPaid && !dryRun) {
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

	// In dry run mode, calculate amounts from gallery pricing if no transaction exists
	if (!existingTransaction && dryRun) {
		// Calculate total from gallery pricing
		const plan = gallery.plan || '1GB-1m';
		const galleryPriceCents = gallery.priceCents || 0;
		
		// Check for backup storage addon
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
				logger.warn('Failed to query addons for dry run', { error: err });
			}
		}
		
		const totalAmountCents = galleryPriceCents + addonPriceCents;
		
		// Calculate wallet vs stripe amounts
		let walletAmountCents = 0;
		let stripeAmountCents = totalAmountCents;
		
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
	const plan = existingTransaction.metadata?.plan || gallery.plan || '1GB-1m';
	
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
	const hasBackupStorage = existingTransaction.metadata?.hasBackupStorage === true || existingTransaction.metadata?.hasBackupStorage === 'true';
	const addonPriceCents = existingTransaction.metadata?.addonPriceCents ? parseInt(existingTransaction.metadata.addonPriceCents) : 0;
	const galleryPriceCents = totalAmountCents - addonPriceCents;

	// Try wallet payment first if enabled
	let paid = false;
	let walletAmountCents = 0;
	let stripeAmountCents = totalAmountCents;
	let checkoutUrl: string | undefined;

	if (walletsTable && ledgerTable) {
		const walletBalance = await getWalletBalance(ownerId, walletsTable);
		
		// In dry run mode, just calculate amounts without processing
		if (dryRun) {
			if (walletBalance >= totalAmountCents) {
				walletAmountCents = totalAmountCents;
				stripeAmountCents = 0;
			} else if (walletBalance > 0) {
				walletAmountCents = walletBalance;
				stripeAmountCents = totalAmountCents - walletBalance;
			}
			
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
		
		if (walletBalance >= totalAmountCents) {
			paid = await debitWallet(ownerId, totalAmountCents, walletsTable, ledgerTable, transactionId);
			if (paid) {
				walletAmountCents = totalAmountCents;
				stripeAmountCents = 0;
				
				// Update transaction status to PAID
				if (transactionsTable) {
					await updateTransactionStatus(ownerId, transactionId, 'PAID');
				}
				
				// Remove TTL and set normal expiry, update gallery state to PAID_ACTIVE
				const now = new Date().toISOString();
				const expiresAtDate = new Date(new Date(now).getTime() + expiryDays * 24 * 60 * 60 * 1000);
				const expiresAt = expiresAtDate.toISOString();
				
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET state = :s, expiresAt = :e, selectionStatus = :ss, updatedAt = :u REMOVE ttl',
					ExpressionAttributeValues: {
						':s': 'PAID_ACTIVE',
						':e': expiresAt,
						':ss': gallery.selectionEnabled ? 'NOT_STARTED' : 'DISABLED',
						':u': now
					}
				}));
				
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
		} else if (walletBalance > 0) {
			// Partial wallet payment
			walletAmountCents = walletBalance;
			stripeAmountCents = totalAmountCents - walletBalance;
		}
		
		logger.info('Wallet payment attempt', {
			ownerId,
			totalAmountCents,
			walletBalance,
			walletAmountCents,
			stripeAmountCents,
			paid
		});
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

