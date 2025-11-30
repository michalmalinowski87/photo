import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;

	if (!bucket || !galleriesTable || !ordersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or orderId' })
		};
	}

	// Enforce owner-only access
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

	// Check if gallery is paid (not DRAFT state)
	// Gallery must be paid before allowing final photo uploads
	let isPaid = false;
	try {
		const paidTransaction = await getPaidTransactionForGallery(galleryId);
		isPaid = !!paidTransaction;
	} catch (err) {
		// If transaction check fails, fall back to gallery state
		isPaid = gallery.state === 'PAID_ACTIVE';
	}

	if (!isPaid) {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Gallery not paid',
				message: 'Cannot process final photos. Gallery must be paid before processing final photos. Please pay for the gallery to continue.'
			})
		};
	}

	// Get order
	const orderGet = await ddb.send(new GetCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId }
	}));
	const order = orderGet.Item as any;
	if (!order) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Order not found' })
		};
	}
	
	logger?.info('Upload final complete - order status check', {
		galleryId,
		orderId,
		currentDeliveryStatus: order.deliveryStatus,
		selectionEnabled: gallery.selectionEnabled
	});

	// SERVER-SIDE CHECK: List all final photos that actually exist in S3
	// This prevents client-side manipulation - we check actual S3 state, not client claims
	const prefix = `galleries/${galleryId}/final/${orderId}/`;
	const finalFilesResponse = await s3.send(new ListObjectsV2Command({
		Bucket: bucket,
		Prefix: prefix
	}));
	const finalFiles = (finalFilesResponse.Contents || []).map(obj => {
		const fullKey = obj.Key || '';
		return fullKey.replace(prefix, '');
	}).filter((key): key is string => Boolean(key) && !key.includes('/'));

	// Note: finalsBytesUsed is already tracked in onUploadResize.ts when each image is processed
	// (same as originalsBytesUsed for originals). No need to recalculate here to avoid double-counting.

	// If no final photos exist, nothing to process
	if (finalFiles.length === 0) {
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'No final photos found, nothing to process' })
		};
	}

	// Update order status to PREPARING_DELIVERY if needed
	// CLIENT_APPROVED → PREPARING_DELIVERY (selection galleries)
	// AWAITING_FINAL_PHOTOS → PREPARING_DELIVERY (non-selection galleries)
	const needsStatusUpdate = !order.deliveryStatus || 
		order.deliveryStatus === 'CLIENT_APPROVED' || 
		order.deliveryStatus === 'AWAITING_FINAL_PHOTOS';
	
	logger?.info('Upload final complete - status update check', {
		galleryId,
		orderId,
		currentDeliveryStatus: order.deliveryStatus,
		needsStatusUpdate,
		finalFilesCount: finalFiles.length
	});
	
	if (needsStatusUpdate) {
		try {
			// Build update command based on whether deliveryStatus exists
			if (order.deliveryStatus) {
				// Status exists - use conditional update to prevent race conditions
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'SET deliveryStatus = :ds',
					ConditionExpression: 'deliveryStatus = :currentStatus',
					ExpressionAttributeValues: {
						':ds': 'PREPARING_DELIVERY',
						':currentStatus': order.deliveryStatus
					}
				}));
			} else {
				// Status doesn't exist - set it directly (no condition needed)
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'SET deliveryStatus = :ds',
					ExpressionAttributeValues: {
						':ds': 'PREPARING_DELIVERY'
					}
				}));
			}
			logger?.info('Updated order status to PREPARING_DELIVERY', { 
				galleryId, 
				orderId,
				previousStatus: order.deliveryStatus || 'undefined',
				newStatus: 'PREPARING_DELIVERY'
			});
			// Update the order object in memory so subsequent checks use the new status
			order.deliveryStatus = 'PREPARING_DELIVERY';
		} catch (updateErr: any) {
		// If status changed between check and update, log and continue
		if (updateErr.name === 'ConditionalCheckFailedException') {
			logger?.warn('Order status changed between check and update', {
				galleryId,
				orderId,
				expectedStatus: order.deliveryStatus || 'undefined'
			});
		} else {
			logger?.error('Failed to update order status', {
				error: updateErr.message,
				galleryId,
				orderId,
				currentStatus: order.deliveryStatus
			});
		}
		}
	} else {
		logger?.info('Status update not needed - order already in correct status', {
			galleryId,
			orderId,
			currentDeliveryStatus: order.deliveryStatus
		});
	}

	logger?.info('Upload completion processed successfully', {
		galleryId,
		orderId,
		finalFilesCount: finalFiles.length,
		statusUpdated: order.deliveryStatus === 'CLIENT_APPROVED' || order.deliveryStatus === 'AWAITING_FINAL_PHOTOS'
	});

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			message: 'Upload completion processed successfully',
			statusUpdated: order.deliveryStatus === 'CLIENT_APPROVED' || order.deliveryStatus === 'AWAITING_FINAL_PHOTOS',
			finalFilesCount: finalFiles.length
		})
	};
});

