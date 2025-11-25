import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { randomBytes, pbkdf2Sync } from 'crypto';
// Transaction creation removed - transactions are now created on-demand in pay.ts endpoint
// This ensures correct payment method (wallet/Stripe/mixed) based on actual wallet balance
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

// Pricing plans based on landing page: 1GB, 3GB, 10GB with duration options (1m, 3m, 12m)
const PRICING_PLANS: Record<string, PlanMetadata> = {
	'1GB-1m': {
		priceCents: 700,      // 7 PLN
		storageLimitBytes: 1 * 1024 * 1024 * 1024,  // 1 GB
		expiryDays: 30        // 1 month
	},
	'1GB-3m': {
		priceCents: 900,      // 9 PLN
		storageLimitBytes: 1 * 1024 * 1024 * 1024,  // 1 GB
		expiryDays: 90        // 3 months
	},
	'1GB-12m': {
		priceCents: 1500,     // 15 PLN
		storageLimitBytes: 1 * 1024 * 1024 * 1024,  // 1 GB
		expiryDays: 365       // 12 months
	},
	'3GB-1m': {
		priceCents: 1200,     // 12 PLN
		storageLimitBytes: 3 * 1024 * 1024 * 1024,  // 3 GB
		expiryDays: 30        // 1 month
	},
	'3GB-3m': {
		priceCents: 1400,     // 14 PLN
		storageLimitBytes: 3 * 1024 * 1024 * 1024,  // 3 GB
		expiryDays: 90        // 3 months
	},
	'3GB-12m': {
		priceCents: 2100,     // 21 PLN
		storageLimitBytes: 3 * 1024 * 1024 * 1024,  // 3 GB
		expiryDays: 365       // 12 months
	},
	'10GB-1m': {
		priceCents: 1400,     // 14 PLN
		storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
		expiryDays: 30        // 1 month
	},
	'10GB-3m': {
		priceCents: 1600,     // 16 PLN
		storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
		expiryDays: 90        // 3 months
	},
	'10GB-12m': {
		priceCents: 2600,     // 26 PLN
		storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB
		expiryDays: 365       // 12 months
	}
};

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
	const plan = body?.plan || '1GB-1m'; // Default plan
	const planMetadata = PRICING_PLANS[plan] || PRICING_PLANS['1GB-1m'];
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
			body: JSON.stringify({ error: 'pricingPackage is required: { packageName: string, includedCount: number, extraPriceCents: number, packagePriceCents: number }' })
		};
	}
	if (
		typeof pricingPackage.packageName !== 'string' || 
		typeof pricingPackage.includedCount !== 'number' || 
		typeof pricingPackage.extraPriceCents !== 'number' ||
		typeof pricingPackage.packagePriceCents !== 'number'
	) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'pricingPackage must have { packageName: string, includedCount: number, extraPriceCents: number, packagePriceCents: number }' })
		};
	}
	if (pricingPackage.includedCount < 0 || pricingPackage.extraPriceCents < 0 || pricingPackage.packagePriceCents < 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'includedCount, extraPriceCents, and packagePriceCents must be 0 or greater' })
		};
	}

	const now = new Date().toISOString();
	const galleryId = `gal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	
	// Calculate expiry date (Warsaw timezone - CET/CEST)
	// Add expiryDays to createdAt timestamp for normal expiry (after payment)
	const createdAtDate = new Date(now);
	const expiresAtDate = new Date(createdAtDate.getTime() + expiryDays * 24 * 60 * 60 * 1000);
	const expiresAt = expiresAtDate.toISOString();
	
	// NEW LOGIC: UNPAID galleries get 3-day TTL for automatic deletion
	// TTL attribute for DynamoDB automatic deletion (Unix epoch time in seconds)
	// DynamoDB will automatically delete the item when TTL expires (typically within 48 hours)
	// After payment, TTL will be removed and normal expiry (expiresAt) will be used
	const ttlExpiresAtDate = new Date(createdAtDate.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
	const ttlExpiresAt = Math.floor(ttlExpiresAtDate.getTime() / 1000);

	// Calculate addon price if requested
	let addonPriceCents = 0;
	const hasBackupStorage = body?.hasBackupStorage === true;
	if (hasBackupStorage) {
		// Calculate addon price based on photographer's plan price (30% of plan price)
		// This makes more sense than basing it on client pricing (extra photos)
		const BACKUP_STORAGE_MULTIPLIER = 0.3;
		addonPriceCents = Math.round(priceCents * BACKUP_STORAGE_MULTIPLIER);
		logger.info('Backup storage addon requested', { 
			galleryId, 
			addonPriceCents, 
			planPriceCents: priceCents,
			multiplier: BACKUP_STORAGE_MULTIPLIER
		});
	}

	// Total price includes gallery plan + addon (if requested)
	const totalPriceCents = priceCents + addonPriceCents;

	// NEW LOGIC: Always create gallery as UNPAID draft (no immediate payment)
	// Gallery will have 3-day TTL and can be paid later via "Opłać galerię" button
	// Transaction will be created on-demand when user clicks "Opłać galerię" button
	// This ensures correct payment method (wallet/Stripe/mixed) based on actual wallet balance

	// Create gallery as UNPAID DRAFT (always, no immediate payment)
	const item: any = {
		galleryId,
		ownerId,
		ownerEmail,
		state: 'DRAFT', // Always DRAFT for new galleries (will become PAID_ACTIVE after payment)
		plan,
		priceCents,
		storageLimitBytes,
		expiresAt, // ISO string for display purposes (normal expiry after payment)
		ttl: ttlExpiresAt, // Unix epoch seconds for DynamoDB TTL automatic deletion (3 days for UNPAID)
		bytesUsed: 0,
		selectionEnabled: !!body.selectionEnabled,
		selectionStatus: body.selectionEnabled ? 'DISABLED' : 'DISABLED', // Disabled until paid
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
		extraPriceCents: pricingPackage.extraPriceCents,
		packagePriceCents: pricingPackage.packagePriceCents
	};

	// Always accept clientEmail and clientPassword during creation (regardless of selectionEnabled)
	// These will be used when sending the final gallery link to the client
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

	await ddb.send(new PutCommand({
		TableName: galleriesTable,
		Item: item
	}));

	// Create backup storage addon if requested (regardless of payment status)
	// Addon will be activated when transaction is paid
	if (hasBackupStorage && addonPriceCents > 0) {
		const addonsTable = envProc?.env?.GALLERY_ADDONS_TABLE as string;
		if (addonsTable) {
			try {
				const { createBackupStorageAddon } = require('../../lib/src/addons');
				const BACKUP_STORAGE_MULTIPLIER = 0.3;
				await createBackupStorageAddon(galleryId, addonPriceCents, BACKUP_STORAGE_MULTIPLIER);
				logger.info('Backup storage addon created during gallery creation', { 
					galleryId, 
					addonPriceCents,
					multiplier: BACKUP_STORAGE_MULTIPLIER,
					paid
				});
			} catch (err: any) {
				logger.error('Failed to create backup storage addon during gallery creation', {
					error: err.message,
					galleryId
				});
				// Continue - addon can be purchased later
			}
		}
	}

	// If selection is disabled, create an order immediately with AWAITING_FINAL_PHOTOS status
	// This allows photographer to upload finals, manage payment, but not send final link until photos are uploaded
	// Order is created regardless of payment status so photographer can finalize delivery
	// Handle initial payment amount from wizard Step 5
	const initialPaymentAmountCents = body?.initialPaymentAmountCents || 0; // Amount paid by client initially
	let orderPaymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' = 'UNPAID';
	
	if (!body.selectionEnabled) {
		if (ordersTable) {
			try {
				// Determine order payment status based on initial payment amount
				if (initialPaymentAmountCents > 0) {
					if (initialPaymentAmountCents >= totalPriceCents) {
						orderPaymentStatus = 'PAID';
					} else {
						orderPaymentStatus = 'PARTIALLY_PAID';
					}
				}
				
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
						deliveryStatus: 'AWAITING_FINAL_PHOTOS', // Start with AWAITING_FINAL_PHOTOS - photographer can upload finals and manage payment
						paymentStatus: orderPaymentStatus,
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
				logger.info('Order created immediately for non-selection gallery', { galleryId, orderId, orderPaymentStatus });
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

	// Always return success - gallery created as UNPAID draft
	// User can pay later via "Opłać galerię" button
	return {
		statusCode: 201,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			galleryId, 
			paid: false,
			message: 'Wersja robocza została utworzona. Wygasa za 3 dni jeśli nie zostanie opłacona.'
		})
	};
}); 

