import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { getJWTFromEvent } from '../../lib/src/jwt';
import { createSelectionApprovedEmail } from '../../lib/src/email';
import { createHash } from 'crypto';
import { getSenderEmail } from '../../lib/src/email-config';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const lambda = new LambdaClient({});
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	if (!galleriesTable || !ordersTable) return { statusCode: 500, body: 'Missing tables' };

	const galleryId = event?.pathParameters?.id;
	if (!galleryId) return { statusCode: 400, body: 'missing id' };

	// Verify JWT token
	const jwtPayload = await getJWTFromEvent(event);
	if (!jwtPayload || jwtPayload.galleryId !== galleryId) {
		return { statusCode: 401, body: 'Unauthorized. Please log in.' };
	}
	const clientId = jwtPayload.clientId;

	// Fetch gallery
	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };

	// Get selections from request body (stored in memory on frontend)
	const body = event?.body ? JSON.parse(event.body) : {};
	const selectedKeys: string[] = Array.isArray(body?.selectedKeys) ? body.selectedKeys : [];
	let photoBookKeys: string[] = Array.isArray(body?.photoBookKeys) ? body.photoBookKeys : [];
	let photoPrintKeys: string[] = Array.isArray(body?.photoPrintKeys) ? body.photoPrintKeys : [];

	// Query all orders once - reuse for all checks
	const ordersQuery = await ddb.send(new QueryCommand({
		TableName: ordersTable,
		KeyConditionExpression: 'galleryId = :g',
		ExpressionAttributeValues: { ':g': galleryId }
	}));
	const orders = ordersQuery.Items || [];

	// Check for existing CHANGES_REQUESTED order first (cancel change request scenario)
	const changesRequestedOrder = orders.find((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
	
	// If canceling change request, use the existing order's selectedKeys and photo book/print keys if none provided
	if (changesRequestedOrder && selectedKeys.length === 0) {
		selectedKeys.push(...(changesRequestedOrder.selectedKeys || []));
		if (photoBookKeys.length === 0 && Array.isArray(changesRequestedOrder.photoBookKeys)) {
			photoBookKeys = [...changesRequestedOrder.photoBookKeys];
		}
		if (photoPrintKeys.length === 0 && Array.isArray(changesRequestedOrder.photoPrintKeys)) {
			photoPrintKeys = [...changesRequestedOrder.photoPrintKeys];
		}
	}

	// Validate selectedKeys only if we don't have a CHANGES_REQUESTED order to restore
	if (selectedKeys.length === 0 && !changesRequestedOrder) {
		return { statusCode: 400, body: 'selectedKeys required' };
	}

	// Check if there's already an order with CLIENT_APPROVED or PREPARING_DELIVERY status
	// (PREPARING_DELIVERY means photographer already did the work, so lock selection)
	// But allow if we're canceling a change request (restoring CHANGES_REQUESTED order)
	const hasActiveOrder = orders.some((o: any) => 
		o.deliveryStatus === 'CLIENT_APPROVED' || o.deliveryStatus === 'PREPARING_DELIVERY'
	);
	if (hasActiveOrder && !changesRequestedOrder) {
		return { statusCode: 403, body: 'selection already approved - order with CLIENT_APPROVED or PREPARING_DELIVERY status exists' };
	}

	// Compute overage from selected keys
	const selectedCount = selectedKeys.length;
	const pkg = gallery.pricingPackage as {
		includedCount?: number;
		extraPriceCents?: number;
		packagePriceCents?: number;
		photoBookCount?: number;
		photoPrintCount?: number;
	} | undefined;

	// Validate and normalize photoBookKeys / photoPrintKeys (offer = count > 0)
	const selectedSet = new Set(selectedKeys);
	const photoBookCount = Math.max(0, pkg?.photoBookCount ?? 0);
	const photoPrintCount = Math.max(0, pkg?.photoPrintCount ?? 0);
	const offerPhotoBook = photoBookCount > 0;
	const offerPhotoPrint = photoPrintCount > 0;
	if (!offerPhotoBook) {
		photoBookKeys = [];
	} else {
		photoBookKeys = photoBookKeys.filter((k) => selectedSet.has(k));
		if (photoBookKeys.length > photoBookCount) {
			return { statusCode: 400, body: 'photoBookKeys length must be <= photoBookCount' };
		}
	}
	if (!offerPhotoPrint) {
		photoPrintKeys = [];
	} else {
		photoPrintKeys = photoPrintKeys.filter((k) => selectedSet.has(k));
		if (photoPrintKeys.length > photoPrintCount) {
			return { statusCode: 400, body: 'photoPrintKeys length must be <= photoPrintCount' };
		}
	}

	// Check if this is "purchase more" scenario (there's a DELIVERED order but no active order)
	const hasDeliveredOrder = orders.some((o: any) => o.deliveryStatus === 'DELIVERED');
	const hasBlockingOrder = orders.some((o: any) => 
		o.deliveryStatus === 'CLIENT_APPROVED' || 
		o.deliveryStatus === 'PREPARING_DELIVERY' || 
		o.deliveryStatus === 'CHANGES_REQUESTED'
	);
	const isPurchaseMore = hasDeliveredOrder && !hasBlockingOrder;
	
	// For purchase more, each photo costs extra (no included count)
	// For first-time selection, use package pricing with included count
	const included = isPurchaseMore ? 0 : Math.max(0, pkg?.includedCount ?? 0);
	const extraPrice = Math.max(0, pkg?.extraPriceCents ?? 0);
	const overageCount = Math.max(0, selectedCount - included);
	const overageCents = overageCount * extraPrice;
	
	const totalCents = overageCents;

	const now = new Date().toISOString();
	// Check for existing orders: CHANGES_REQUESTED (restore) or CLIENT_SELECTING (update), otherwise create new
	// Priority: CHANGES_REQUESTED first (restore), then CLIENT_SELECTING (update)
	// Note: changesRequestedOrder was already found above, reuse it
	const existingOrder = changesRequestedOrder 
		|| orders.find((o: any) => o.deliveryStatus === 'CLIENT_SELECTING');
	
	let orderId: string | undefined;
	let orderNumber: number | undefined;
	
	// Compute hash BEFORE updating order status - needed for ZIP generation
	let selectedKeysHash: string | undefined;
	if (zipFnName && bucket && selectedKeys.length > 0) {
		try {
			const pLimit = require('p-limit');
			const limit = pLimit(10); // Limit concurrent HeadObject calls
			
			const filesWithMetadata = await Promise.all(
				selectedKeys.map(key => 
					limit(async () => {
						const s3Key = `galleries/${galleryId}/originals/${key}`;
						try {
							const headResponse = await s3.send(new HeadObjectCommand({
								Bucket: bucket,
								Key: s3Key
							}));
							return {
								filename: key,
								etag: headResponse.ETag || '',
								size: headResponse.ContentLength || 0,
								lastModified: headResponse.LastModified?.getTime() || 0
							};
						} catch (headErr: any) {
							if (headErr.name === 'NotFound' || headErr.name === 'NoSuchKey') {
								// File doesn't exist - include in hash with null values to detect missing files
								return {
									filename: key,
									etag: '',
									size: 0,
									lastModified: 0,
									missing: true
								};
							}
							throw headErr;
						}
					})
				)
			);
			
			// Sort by filename for consistent hashing
			filesWithMetadata.sort((a, b) => a.filename.localeCompare(b.filename));
			
			selectedKeysHash = createHash('sha256')
				.update(JSON.stringify(filesWithMetadata))
				.digest('hex')
				.substring(0, 16); // Use first 16 chars for shorter hash
		} catch (hashErr: any) {
			// Log but continue - hash computation failure shouldn't block order creation
			logger.warn('Failed to compute selectedKeysHash', {
				error: hashErr.message,
				galleryId
			});
		}
	}

	if (existingOrder) {
		orderId = existingOrder.orderId;
		orderNumber = existingOrder.orderNumber; // Preserve existing orderNumber
		
		// Check if final photos already exist for this order
		// If they do, status should be PREPARING_DELIVERY, not CLIENT_APPROVED
		let hasFinalPhotos = false;
		const imagesTable = envProc?.env?.IMAGES_TABLE as string;
		if (imagesTable && orderId) {
			try {
				// Query DynamoDB to check if any final images exist for this order
				const finalFilesResponse = await ddb.send(new QueryCommand({
					TableName: imagesTable,
					IndexName: 'galleryId-orderId-index', // Use GSI for efficient querying by orderId
					KeyConditionExpression: 'galleryId = :g AND orderId = :orderId',
					FilterExpression: '#type = :type', // Filter by type (GSI is sparse, but filter for safety)
					ExpressionAttributeNames: {
						'#type': 'type'
					},
					ExpressionAttributeValues: {
						':g': galleryId,
						':orderId': orderId,
						':type': 'final'
					},
					Limit: 1 // We only need to know if any files exist
				}));
				hasFinalPhotos = (finalFilesResponse.Items?.length || 0) > 0;
			} catch (finalCheckErr: any) {
				// Log but continue - if check fails, default to CLIENT_APPROVED
				logger.warn('Failed to check for existing final photos', {
					error: finalCheckErr.message,
					galleryId,
					orderId
				});
			}
		}
		
		// Determine delivery status based on whether final photos exist
		// If final photos exist, status should be PREPARING_DELIVERY (photographer already did the work)
		// Otherwise, status should be CLIENT_APPROVED (ready for photographer to process)
		const deliveryStatus = hasFinalPhotos ? 'PREPARING_DELIVERY' : 'CLIENT_APPROVED';
		
		// Set zipGenerating flag BEFORE updating status
		// This prevents race condition where order status poll happens before flag is set
		// Clear old ZIP-related fields when updating order (new selection = new ZIP needed)
		// IMPORTANT: Always generate ZIP when selection is approved, regardless of status
		// This is because the selection changed (via change request), so ZIP needs to be regenerated
		// Status is PREPARING_DELIVERY if finals exist, but ZIP generation still happens
		// Add stage-specific timestamps for funnel tracking
		const stageTimestampField = deliveryStatus === 'CLIENT_APPROVED' ? 'clientApprovedAt' : 'preparingDeliveryAt';
		const updateExpr = selectedKeysHash
			? `SET deliveryStatus = :ds, selectedKeys = :sk, selectedCount = :sc, overageCount = :oc, overageCents = :ocents, totalCents = :tc, updatedAt = :u, zipGenerating = :g, zipGeneratingSince = :ts, zipSelectedKeysHash = :h, photoBookKeys = :pbk, photoPrintKeys = :ppk, ${stageTimestampField} = :stageTs REMOVE canceledAt, zipKey, zipProgress`
			: `SET deliveryStatus = :ds, selectedKeys = :sk, selectedCount = :sc, overageCount = :oc, overageCents = :ocents, totalCents = :tc, updatedAt = :u, zipGenerating = :g, zipGeneratingSince = :ts, photoBookKeys = :pbk, photoPrintKeys = :ppk, ${stageTimestampField} = :stageTs REMOVE canceledAt, zipKey, zipSelectedKeysHash, zipProgress`;
		
		const updateValues: any = {
			':ds': deliveryStatus,
			':sk': selectedKeys,
			':sc': selectedCount,
			':oc': overageCount,
			':ocents': overageCents,
			':tc': totalCents,
			':u': now,
			':g': true,
			':ts': Date.now(),
			':stageTs': now, // Timestamp for stage transition
			':pbk': photoBookKeys,
			':ppk': photoPrintKeys
		};
		if (selectedKeysHash) {
			updateValues[':h'] = selectedKeysHash;
		}
		
		await ddb.send(new UpdateCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId },
			UpdateExpression: updateExpr,
			ExpressionAttributeValues: updateValues
		}));
	} else {
		// Create new order - reuse gallery from earlier fetch
		orderNumber = (gallery?.lastOrderNumber ?? 0) + 1;
		orderId = `${orderNumber}-${Date.now()}`;
		const orderItem: any = {
			galleryId,
			orderId,
			orderNumber,
			ownerId: gallery.ownerId, // Denormalize ownerId for efficient querying
			deliveryStatus: 'CLIENT_APPROVED',
			paymentStatus: 'UNPAID',
			selectedKeys,
			selectedCount,
			overageCount,
			overageCents,
			totalCents,
			photoBookKeys,
			photoPrintKeys,
			createdAt: now,
			clientApprovedAt: now, // Timestamp for CLIENT_APPROVED stage (for funnel tracking)
			zipGenerating: true,
			zipGeneratingSince: Date.now()
		};
		if (selectedKeysHash) {
			orderItem.zipSelectedKeysHash = selectedKeysHash;
		}
		await ddb.send(new PutCommand({
			TableName: ordersTable,
			Item: orderItem
		}));
	}
	await ddb.send(new UpdateCommand({
		TableName: galleriesTable,
		Key: { galleryId },
		UpdateExpression: 'SET selectionStatus = :s, selectionStats = :stats, lastOrderNumber = :n, currentOrderId = :oid, updatedAt = :u',
		ExpressionAttributeValues: {
			':s': 'APPROVED',
			':stats': { selectedCount, overageCount, overageCents },
			':n': orderNumber,
			':oid': orderId,
			':u': now
		}
	}));
	
	// Pre-generate ZIP in background after order creation/update
	// Always regenerate ZIP when selection is approved (new or changed selection)
	// This includes both CLIENT_APPROVED and PREPARING_DELIVERY statuses
	// For PREPARING_DELIVERY: selection changed via change request, so ZIP must be regenerated
	// For CLIENT_APPROVED: normal flow, ZIP generation needed
	// Note: zipGenerating flag is already set above BEFORE order status update to prevent race conditions
	const shouldGenerateZip = zipFnName && bucket && orderId && selectedKeys.length > 0 && selectedKeysHash;
	if (shouldGenerateZip) {
		try {
			// Invoke ZIP generation Lambda asynchronously
			// Hash was already computed above, so we can use it here
			const payload = Buffer.from(JSON.stringify({ 
				galleryId, 
				keys: selectedKeys, 
				orderId,
				selectedKeysHash // Pass hash to ZIP generation function
			}));
			
			await lambda.send(new InvokeCommand({ 
				FunctionName: zipFnName, 
				Payload: payload, 
				InvocationType: 'Event' // Async invocation
			}));
			
			logger.info('ZIP generation Lambda invoked for pre-generation', { galleryId, orderId, zipFnName });
		} catch (zipErr: any) {
			// Log but don't fail - ZIP generation is best effort, user can still download later
			// Clear the flag if Lambda invocation failed
			try {
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'REMOVE zipGenerating, zipGeneratingSince, zipSelectedKeysHash'
				}));
			} catch (clearErr: any) {
				logger.warn('Failed to clear zipGenerating flag after Lambda invocation failure', {
					error: clearErr.message,
					galleryId,
					orderId
				});
			}
			logger.error('Failed to start ZIP pre-generation', {
				error: zipErr.message,
				galleryId,
				orderId,
				zipFnName
			});
		}
	} else if (zipFnName && bucket && orderId && selectedKeys.length > 0 && !selectedKeysHash) {
		// Hash computation failed - clear the flag we set optimistically
		try {
			await ddb.send(new UpdateCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId },
				UpdateExpression: 'REMOVE zipGenerating, zipGeneratingSince'
			}));
		} catch (clearErr: any) {
			logger.warn('Failed to clear zipGenerating flag after hash computation failure', {
				error: clearErr.message,
				galleryId,
				orderId
			});
		}
	}

	// Notify photographer with summary (best effort)
	const stage = (globalThis as any).process?.env?.STAGE || 'dev';
	const sender = await getSenderEmail();
	const notify = gallery.ownerEmail;
	let dashboardUrl: string | undefined;
	try {
		dashboardUrl = await getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' });
	} catch {
		// Best-effort: still send email without order link if config is missing
		dashboardUrl = undefined;
	}
	const dashboardBase = dashboardUrl ? dashboardUrl.replace(/\/+$/, '') : undefined;
	const orderUrl = dashboardBase && orderId ? `${dashboardBase}/galleries/${galleryId}/orders/${orderId}` : undefined;

	if (sender && notify && orderId) {
		const emailTemplate = createSelectionApprovedEmail(
			galleryId,
			gallery.galleryName || gallery.name,
			clientId,
			selectedCount,
			overageCount,
			overageCents,
			orderId,
			orderUrl
		);
		try {
			logger.info('Sending SES email - Selection Approved', {
				from: sender,
				to: notify,
				subject: emailTemplate.subject,
				galleryId,
				orderId
			});
			const result = await ses.send(new SendEmailCommand({
				Source: sender,
				Destination: { ToAddresses: [notify] },
				Message: {
					Subject: { Data: emailTemplate.subject },
					Body: {
						Text: { Data: emailTemplate.text },
						Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
					}
				}
			}));
			logger.info('SES email sent successfully - Selection Approved', {
				messageId: result.MessageId,
				requestId: result.$metadata?.requestId,
				from: sender,
				to: notify
			});
		} catch (err: any) {
			logger.error('SES send failed - Selection Approved Email', {
				error: {
					name: err.name,
					message: err.message,
					code: err.code,
					statusCode: err.$metadata?.httpStatusCode,
					requestId: err.$metadata?.requestId,
					stack: err.stack
				},
				emailDetails: {
					from: sender,
					to: notify,
					subject: emailTemplate.subject,
					galleryId,
					orderId
				},
				envCheck: {
					senderConfigured: !!sender,
					notifyConfigured: !!notify
				}
			});
		}
	}
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			galleryId,
			clientId,
			orderId,
			selectedCount,
			overageCount,
			overageCents,
			totalCents,
			status: 'APPROVED'
		})
	};
});


