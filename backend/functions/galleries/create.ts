import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { randomBytes, pbkdf2Sync } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function hashPassword(password: string) {
	const salt = randomBytes(16).toString('hex');
	const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
	return { salt, hash, iterations: 100000, algo: 'pbkdf2-sha256' };
}

// Pricing plans metadata
interface PlanMetadata {
	priceCents: number;
	storageLimitBytes: number;
	expiryDays: number;
}

const PRICING_PLANS: Record<string, PlanMetadata> = {
	Basic: {
		priceCents: 700,      // 7 PLN
		storageLimitBytes: 1 * 1024 * 1024,  // 1 MB
		expiryDays: 3
	},
	Standard: {
		priceCents: 1000,     // 10 PLN
		storageLimitBytes: 10 * 1024 * 1024, // 10 MB
		expiryDays: 30        // 1 month
	},
	Pro: {
		priceCents: 1500,     // 15 PLN
		storageLimitBytes: 100 * 1024 * 1024, // 100 MB
		expiryDays: 90        // 3 months
	}
};

async function debitWallet(userId: string, amountCents: number, walletsTable: string, ledgerTable: string): Promise<boolean> {
	const now = new Date().toISOString();
	
	try {
		// Get current balance
		const walletGet = await ddb.send(new GetCommand({
			TableName: walletsTable,
			Key: { userId }
		}));
		
		const currentBalance = walletGet.Item?.balanceCents || 0;
		if (currentBalance < amountCents) {
			return false; // Insufficient balance
		}

		const newBalance = currentBalance - amountCents;
		const txnId = `debit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

		// Atomic update with condition
		// If wallet doesn't exist, create it with balance 0 first, then fail the condition check
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

			// Create ledger entry
			await ddb.send(new PutCommand({
				TableName: ledgerTable,
				Item: {
					userId,
					txnId,
					type: 'DEBIT',
					amountCents: -amountCents,
					refId: txnId,
					createdAt: now
				}
			}));

			return true;
		} catch (err: any) {
			if (err.name === 'ConditionalCheckFailedException') {
				return false; // Balance changed, insufficient
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
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const apiUrl = envProc?.env?.PUBLIC_API_URL as string || '';
	
	logger.info('Gallery creation request', {
		hasStripeKey: !!stripeSecretKey,
		hasApiUrl: !!apiUrl,
		hasWalletsTable: !!walletsTable,
		hasLedgerTable: !!ledgerTable
	});

	if (!galleriesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing GALLERIES_TABLE' })
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

	// Extract ownerEmail from JWT claims
	const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
	const ownerEmail = claims.email || '';

	const body = event?.body ? JSON.parse(event.body) : {};
	const plan = body?.plan || 'Basic'; // Default plan
	const planMetadata = PRICING_PLANS[plan] || PRICING_PLANS.Basic;
	const priceCents = planMetadata.priceCents;
	const storageLimitBytes = planMetadata.storageLimitBytes;
	const expiryDays = planMetadata.expiryDays;
	const useWallet = body?.useWallet !== false; // Default to true
	
	// Get pricingPackage (required for client pricing)
	const pricingPackage = body?.pricingPackage;
	if (!pricingPackage) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'pricingPackage is required: { packageName: string, includedCount: number, extraPriceCents: number }' })
		};
	}
	if (
		typeof pricingPackage.packageName !== 'string' || 
		typeof pricingPackage.includedCount !== 'number' || 
		typeof pricingPackage.extraPriceCents !== 'number'
	) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'pricingPackage must have { packageName: string, includedCount: number, extraPriceCents: number }' })
		};
	}
	if (pricingPackage.includedCount < 0 || pricingPackage.extraPriceCents < 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'includedCount and extraPriceCents must be 0 or greater' })
		};
	}

	const now = new Date().toISOString();
	const galleryId = `gal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	
	// Calculate expiry date (Warsaw timezone - CET/CEST)
	// Add expiryDays to createdAt timestamp
	const createdAtDate = new Date(now);
	const expiresAtDate = new Date(createdAtDate.getTime() + expiryDays * 24 * 60 * 60 * 1000);
	const expiresAt = expiresAtDate.toISOString();

	// Try wallet debit first if enabled
	let paid = false;
	let checkoutUrl: string | undefined;

	if (useWallet && walletsTable && ledgerTable) {
		paid = await debitWallet(ownerId, priceCents, walletsTable, ledgerTable);
		logger.info('Wallet debit attempt', { ownerId, priceCents, paid, hasWalletsTable: !!walletsTable, hasLedgerTable: !!ledgerTable });
	}

	// If wallet debit failed and Stripe is configured, offer one-off payment
	if (!paid && stripeSecretKey) {
		try {
			const stripe = new Stripe(stripeSecretKey);
			const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
			const redirectUrl = `${dashboardUrl}/galleries?payment=success&gallery=${galleryId}`;
			
			const successUrl = apiUrl 
				? `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`
				: `https://your-frontend/payments/success?session_id={CHECKOUT_SESSION_ID}`;
			const cancelUrl = apiUrl
				? `${apiUrl}/payments/cancel`
				: 'https://your-frontend/payments/cancel';

			logger.info('Creating Stripe checkout session', {
				galleryId,
				priceCents,
				successUrl,
				cancelUrl,
				redirectUrl,
				apiUrlConfigured: !!apiUrl
			});

			const session = await stripe.checkout.sessions.create({
				payment_method_types: ['card'],
				mode: 'payment',
				line_items: [
					{
						price_data: {
							currency: 'pln',
							product_data: {
								name: `Gallery: ${galleryId}`,
								description: `PhotoHub gallery creation - ${plan} plan`
							},
							unit_amount: priceCents
						},
						quantity: 1
					}
				],
				success_url: successUrl,
				cancel_url: cancelUrl,
				metadata: {
					userId: ownerId,
					type: 'gallery_payment',
					galleryId,
					redirectUrl: redirectUrl // Store redirect URL in metadata
				}
			});

			checkoutUrl = session.url;
			logger.info('Stripe checkout session created', { checkoutUrl, sessionId: session.id });
			// Gallery will be marked as paid when webhook processes the payment
		} catch (err: any) {
			logger.error('Stripe checkout creation failed', {
				error: {
					name: err.name,
					message: err.message,
					code: err.code,
					type: err.type,
					stack: err.stack
				},
				stripeSecretKeyConfigured: !!stripeSecretKey,
				stripeSecretKeyLength: stripeSecretKey?.length || 0,
				apiUrlConfigured: !!apiUrl
			});
		}
	} else if (!paid) {
		logger.warn('Stripe not configured', {
			stripeSecretKeyConfigured: !!stripeSecretKey,
			useWallet,
			walletsTableConfigured: !!walletsTable,
			ledgerTableConfigured: !!ledgerTable
		});
	}

	// Create gallery (will be marked PAID_ACTIVE if wallet debit succeeded, otherwise DRAFT)
	const item: any = {
		galleryId,
		ownerId,
		ownerEmail,
		state: paid ? 'PAID_ACTIVE' : 'DRAFT',
		plan,
		priceCents,
		storageLimitBytes,
		expiresAt,
		bytesUsed: 0,
		selectionEnabled: !!body.selectionEnabled,
		selectionStatus: body.selectionEnabled ? (paid ? 'NOT_STARTED' : 'DISABLED') : 'DISABLED',
		createdAt: now,
		updatedAt: now
	};
	
	// Add galleryName if provided (optional, for nicer presentation)
	if (body?.galleryName && typeof body.galleryName === 'string' && body.galleryName.trim()) {
		item.galleryName = body.galleryName.trim();
	}
	
	// Add pricingPackage (required for client pricing per gallery)
	item.pricingPackage = {
		packageName: pricingPackage.packageName,
		includedCount: pricingPackage.includedCount,
		extraPriceCents: pricingPackage.extraPriceCents
	};

	// If selection is enabled, optionally accept clientEmail and clientPassword during creation
	// These will be used when sending the gallery to the client
	if (body.selectionEnabled) {
		const clientEmail = body?.clientEmail;
		const clientPassword = body?.clientPassword;
		
		if (clientEmail && typeof clientEmail === 'string' && clientEmail.trim()) {
			item.clientEmail = clientEmail.trim();
			
			// If password is provided, hash it for verification AND store it encrypted for sending emails
			if (clientPassword && typeof clientPassword === 'string' && clientPassword.trim()) {
				const passwordPlain = clientPassword.trim();
				const secrets = hashPassword(passwordPlain);
				item.clientPasswordHash = secrets.hash;
				item.clientPasswordSalt = secrets.salt;
				item.clientPasswordIter = secrets.iterations;
				
				// Store password encrypted (base64 for now - in production, use proper encryption with KMS)
				// This allows us to send it via email later
				item.clientPasswordEncrypted = Buffer.from(passwordPlain, 'utf-8').toString('base64');
			}
		}
	}

	await ddb.send(new PutCommand({
		TableName: galleriesTable,
		Item: item
	}));

	// If selection is disabled and gallery is paid, create an order immediately with APPROVED status
	if (paid && !body.selectionEnabled) {
		if (ordersTable) {
			try {
				const orderNumber = 1;
				const orderId = `${orderNumber}-${Date.now()}`;
				// Create order with all photos (empty selectedKeys means all photos)
				// We'll need to get image count later, but for now create order with 0 selected
				await ddb.send(new PutCommand({
					TableName: ordersTable,
					Item: {
						galleryId,
						orderId,
						orderNumber,
						deliveryStatus: 'CLIENT_APPROVED', // Use deliveryStatus instead of status
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
				logger.info('Order created immediately for non-selection gallery', { galleryId, orderId });
			} catch (orderErr: any) {
				// Log but don't fail gallery creation if order creation fails
				logger.error('Failed to create order for non-selection gallery', {
					error: {
						name: orderErr.name,
						message: orderErr.message
					},
					galleryId
				});
			}
		}
	}

	if (paid) {
		return {
			statusCode: 201,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ galleryId, paid: true, method: 'wallet' })
		};
	} else if (checkoutUrl) {
		return {
			statusCode: 201,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				galleryId, 
				paid: false, 
				checkoutUrl,
				message: 'Insufficient wallet balance. Please complete payment to activate gallery.'
			})
		};
	} else {
		return {
			statusCode: 402,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Payment required',
				galleryId,
				priceCents,
				message: 'Insufficient wallet balance and payment system not configured. Please top up your wallet or configure Stripe.'
			})
		};
	}
}); 

