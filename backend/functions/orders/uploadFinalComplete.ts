import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';
import { recalculateStorageInternal } from '../galleries/recalculateBytesUsed';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;

	if (!galleriesTable || !ordersTable) {
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
	// For non-selective galleries, allow uploads even if not paid
	// For selective galleries, require payment
	const isNonSelectionGallery = gallery.selectionEnabled === false;
	let isPaid = false;
	try {
		const paidTransaction = await getPaidTransactionForGallery(galleryId);
		isPaid = !!paidTransaction;
	} catch (err) {
		// If transaction check fails, fall back to gallery state
		isPaid = gallery.state === 'PAID_ACTIVE';
	}

	// Only require payment for selective galleries
	if (!isNonSelectionGallery && !isPaid) {
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

	// SERVER-SIDE CHECK: Query DynamoDB for final photos that exist
	// This prevents client-side manipulation - we check actual DynamoDB state, not client claims
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
	if (!imagesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing IMAGES_TABLE environment variable' })
		};
	}

	let allFinalImageRecords: any[] = [];
	let lastEvaluatedKey: any = undefined;

	do {
		const queryParams: any = {
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
			ProjectionExpression: 'filename',
			Limit: 1000
		};

		if (lastEvaluatedKey) {
			queryParams.ExclusiveStartKey = lastEvaluatedKey;
		}

		const queryResponse = await ddb.send(new QueryCommand(queryParams));
		allFinalImageRecords.push(...(queryResponse.Items || []));
		lastEvaluatedKey = queryResponse.LastEvaluatedKey;
	} while (lastEvaluatedKey);

	const finalFiles = allFinalImageRecords.map(record => record.filename);

	// Note: finalsBytesUsed is tracked via storage recalculation when images are uploaded
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
	
	// Trigger storage recalculation after final uploads complete
	// This ensures accurate storage values immediately after upload (bypasses 5-minute cache)
	try {
		if (imagesTable) {
			await recalculateStorageInternal(galleryId, galleriesTable, imagesTable, gallery, logger, true);
		}
		logger?.info('Triggered storage recalculation after final upload completion', { galleryId, orderId });
	} catch (recalcErr: any) {
		logger?.warn('Failed to trigger storage recalculation after final upload', {
			error: recalcErr.message,
			galleryId,
			orderId
		});
		// Don't fail the request - recalculation will happen on next read (cache will expire)
	}

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

