import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { randomBytes, pbkdf2Sync } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function hashPassword(password: string) {
	const salt = randomBytes(16).toString('hex');
	const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
	return { salt, hash, iterations: 100000, algo: 'pbkdf2-sha256' };
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;

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
	
	// Get pricingPackage (required for client pricing)
	const pricingPackage = body?.pricingPackage;
	if (!pricingPackage) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'pricingPackage is required: { packageName?: string, includedCount: number, extraPriceCents: number, packagePriceCents: number }' })
		};
	}
	if (
		(pricingPackage.packageName !== undefined && typeof pricingPackage.packageName !== 'string') ||
		typeof pricingPackage.includedCount !== 'number' || 
		typeof pricingPackage.extraPriceCents !== 'number' ||
		typeof pricingPackage.packagePriceCents !== 'number'
	) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'pricingPackage must have { packageName?: string, includedCount: number, extraPriceCents: number, packagePriceCents: number }' })
		};
	}
	
	// Package name is optional - use provided name or undefined
	const finalPackageName = (pricingPackage.packageName && pricingPackage.packageName.trim()) 
		? pricingPackage.packageName.trim() 
		: undefined;
	if (pricingPackage.includedCount < 0 || pricingPackage.extraPriceCents < 0 || pricingPackage.packagePriceCents < 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'includedCount, extraPriceCents, and packagePriceCents must be 0 or greater' })
		};
	}

	const now = new Date().toISOString();
	const galleryId = `gal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	
	// NEW LOGIC: UNPAID galleries get 3-day TTL for automatic deletion
	// TTL attribute for DynamoDB automatic deletion (Unix epoch time in seconds)
	// DynamoDB will automatically delete the item when TTL expires (typically within 48 hours)
	// After payment, TTL will be removed and normal expiry (expiresAt) will be used
	const createdAtDate = new Date(now);
	const ttlExpiresAtDate = new Date(createdAtDate.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
	const ttlExpiresAt = Math.floor(ttlExpiresAtDate.getTime() / 1000);

	// NEW LOGIC: Always create gallery as UNPAID draft (no immediate payment)
	// Gallery will have 3-day TTL and can be paid later via "Opłać galerię" button
	// Transaction will be created on-demand when user clicks "Opłać galerię" button
	// This ensures correct payment method (wallet/Stripe/mixed) based on actual wallet balance

	// Create gallery as UNPAID DRAFT (always, no immediate payment, no plan)
	const item: any = {
		galleryId,
		ownerId,
		ownerEmail,
		state: 'DRAFT', // Always DRAFT for new galleries (will become PAID_ACTIVE after payment)
		// No plan, priceCents, storageLimitBytes, or expiresAt - will be set after plan calculation
		ttl: ttlExpiresAt, // Unix epoch seconds for DynamoDB TTL automatic deletion (3 days for UNPAID)
		originalsBytesUsed: 0,
		finalsBytesUsed: 0,
		bytesUsed: 0, // Keep for backward compatibility
		selectionEnabled: !!body.selectionEnabled,
		selectionStatus: body.selectionEnabled ? 'DISABLED' : 'DISABLED', // Disabled until paid
		version: 1, // Optimistic locking version number
		createdAt: now,
		updatedAt: now
	};
	
	// Add galleryName if provided (optional, for nicer presentation)
	if (body?.galleryName && typeof body.galleryName === 'string' && body.galleryName.trim()) {
		item.galleryName = body.galleryName.trim();
	}
	
	// Add pricingPackage (required for client pricing per gallery)
	// Build pricingPackage object - only include packageName if it exists
	const pricingPackageItem: {
		packageName?: string;
		includedCount: number;
		extraPriceCents: number;
		packagePriceCents: number;
	} = {
		includedCount: pricingPackage.includedCount,
		extraPriceCents: pricingPackage.extraPriceCents,
		packagePriceCents: pricingPackage.packagePriceCents
	};
	if (finalPackageName !== undefined) {
		pricingPackageItem.packageName = finalPackageName;
	}
	item.pricingPackage = pricingPackageItem;

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
				// Note: totalPriceCents is not available here since plan is not selected yet
				// For now, treat any payment as PARTIALLY_PAID (will be updated after plan selection)
				if (initialPaymentAmountCents > 0) {
					orderPaymentStatus = 'PARTIALLY_PAID';
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

