import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import type { LambdaEvent, LambdaContext, GalleryItem } from '../../lib/src/lambda-types';
import { createExpirySchedule, getScheduleName } from '../../lib/src/expiry-scheduler';
import {
	encryptClientGalleryPassword,
	getGalleryPasswordEncryptionSecret,
	hashClientGalleryPassword,
} from '../../lib/src/client-gallery-password';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: LambdaEvent, context: LambdaContext) => {
	const logger = context?.logger;
	const envProc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
	const stage = envProc?.env?.STAGE || 'dev';
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

	const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
	const ownerEmail = claims.email || '';

	const body = event?.body ? JSON.parse(event.body) : {};

	logger?.info('Gallery creation request', { 
		selectionEnabledRaw: body?.selectionEnabled,
		hasOrdersTable: !!ordersTable,
		bodyKeys: Object.keys(body)
	});
	
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
	
	// UNPAID galleries expire in 3 days
	// Set expiresAt (ISO timestamp) and create EventBridge schedule for precise deletion
	const createdAtDate = new Date(now);
	const expiresAtDate = new Date(createdAtDate.getTime() + 3 * 24 * 60 * 60 * 1000);
	const expiresAt = expiresAtDate.toISOString();

	// Always create gallery as UNPAID draft - transaction created on-demand when user clicks "Opłać galerię"
	// This ensures correct payment method (wallet/Stripe/mixed) based on actual wallet balance
	const item: Partial<GalleryItem> & {
		galleryId: string;
		ownerId: string;
		ownerEmail: string;
		state: string;
		expiresAt: string;
		originalsBytesUsed: number;
		finalsBytesUsed: number;
		selectionEnabled: boolean;
		selectionStatus: string;
		version: number;
		createdAt: string;
		updatedAt: string;
	} = {
		galleryId,
		ownerId,
		ownerEmail,
		state: 'DRAFT',
		expiresAt,
		originalsBytesUsed: 0,
		finalsBytesUsed: 0,
		selectionEnabled: !!body.selectionEnabled,
		selectionStatus: 'DISABLED',
		version: 1,
		createdAt: now,
		updatedAt: now
	};
	
	if (body?.galleryName && typeof body.galleryName === 'string' && body.galleryName.trim()) {
		item.galleryName = body.galleryName.trim();
	}
	
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

	const clientEmail = body?.clientEmail;
	const clientPassword = body?.clientPassword;
	
	if (clientEmail && typeof clientEmail === 'string' && clientEmail.trim()) {
		item.clientEmail = clientEmail.trim();
		
		if (clientPassword && typeof clientPassword === 'string' && clientPassword.trim()) {
			const passwordPlain = clientPassword.trim();
			const secrets = hashClientGalleryPassword(passwordPlain);
			item.clientPasswordHash = secrets.hashHex;
			item.clientPasswordSalt = secrets.saltHex;
			item.clientPasswordIter = secrets.iterations;
			
			// Store password encrypted (reversible) for future email sending (NEVER store plaintext/base64).
			const encSecret = await getGalleryPasswordEncryptionSecret(stage);
			if (!encSecret) {
				return {
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						error: 'Missing GalleryPasswordEncryptionSecret',
						message:
							'Gallery password encryption secret is not configured. Set SSM /PhotoHub/<stage>/GalleryPasswordEncryptionSecret or env GALLERY_PASSWORD_ENCRYPTION_SECRET.',
					}),
				};
			}
			item.clientPasswordEncrypted = encryptClientGalleryPassword(passwordPlain, encSecret);
		}
	}

	await ddb.send(new PutCommand({
		TableName: galleriesTable,
		Item: item
	}));

	// Create EventBridge schedule for gallery expiration
	const deletionLambdaArn = envProc?.env?.GALLERY_EXPIRY_DELETION_LAMBDA_ARN as string;
	const scheduleRoleArn = envProc?.env?.GALLERY_EXPIRY_SCHEDULE_ROLE_ARN as string;
	const dlqArn = envProc?.env?.GALLERY_EXPIRY_DLQ_ARN as string;
	
	if (deletionLambdaArn && scheduleRoleArn) {
		try {
			const scheduleName = await createExpirySchedule(galleryId, expiresAt, deletionLambdaArn, scheduleRoleArn, dlqArn, logger);
			
			// Store schedule name in gallery
			await ddb.send(new UpdateCommand({
				TableName: galleriesTable,
				Key: { galleryId },
				UpdateExpression: 'SET expiryScheduleName = :sn',
				ExpressionAttributeValues: {
					':sn': scheduleName
				}
			}));
			
			logger?.info('Created EventBridge schedule for gallery expiration', { galleryId, scheduleName, expiresAt });
		} catch (scheduleErr: any) {
			logger?.error('Failed to create EventBridge schedule for gallery', {
				error: {
					name: scheduleErr.name,
					message: scheduleErr.message
				},
				galleryId,
				expiresAt
			});
			// Continue even if schedule creation fails - gallery will still be created
		}
	} else {
		logger?.warn('EventBridge Scheduler not configured - gallery expiration schedule not created', {
			galleryId,
			hasDeletionLambdaArn: !!deletionLambdaArn,
			hasScheduleRoleArn: !!scheduleRoleArn
		});
	}

	// If selection is disabled, create an order immediately with AWAITING_FINAL_PHOTOS status
	// This allows photographer to upload finals and manage payment, but not send final link until photos are uploaded
	const initialPaymentAmountCents = body?.initialPaymentAmountCents || 0;
	let orderPaymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' = 'UNPAID';
	let createdOrderId: string | undefined = undefined;
	
	const isNonSelectionGallery = !body.selectionEnabled;
	logger?.info('Checking order creation', { 
		selectionEnabled: !!body.selectionEnabled, 
		isNonSelectionGallery,
		hasOrdersTable: !!ordersTable 
	});
	
	if (isNonSelectionGallery) {
		if (ordersTable) {
			try {
				// totalPriceCents not available here since plan is not selected yet - treat any payment as PARTIALLY_PAID
				if (initialPaymentAmountCents > 0) {
					orderPaymentStatus = 'PARTIALLY_PAID';
				}
				
				const orderNumber = 1;
				const orderId = `${orderNumber}-${Date.now()}`;
				createdOrderId = orderId;
				await ddb.send(new PutCommand({
					TableName: ordersTable,
					Item: {
						galleryId,
						orderId,
						orderNumber,
						ownerId: ownerId,
						deliveryStatus: 'AWAITING_FINAL_PHOTOS',
						paymentStatus: orderPaymentStatus,
						selectedKeys: [],
						selectedCount: 0,
						overageCount: 0,
						overageCents: 0,
						totalCents: 0,
						createdAt: now
					}
				}));
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
				logger?.info('Order created immediately for non-selection gallery', { galleryId, orderId, orderPaymentStatus });
			} catch (orderErr: unknown) {
				const error = orderErr instanceof Error ? orderErr : new Error(String(orderErr));
				logger?.error('Failed to create order for non-selection gallery', {
					error: {
						name: error.name,
						message: error.message
					},
					galleryId
				});
			}
		} else {
			logger?.warn('Orders table not configured, cannot create order for non-selection gallery', { galleryId });
		}
	}

	return {
		statusCode: 201,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			galleryId, 
			paid: false,
			selectionEnabled: !!body.selectionEnabled,
			orderId: createdOrderId,
			message: 'Wersja robocza została utworzona. Wygasa za 3 dni jeśli nie zostanie opłacona.'
		})
	};
}); 

