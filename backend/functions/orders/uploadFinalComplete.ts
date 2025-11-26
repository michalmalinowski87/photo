import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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

	// Calculate total size of final files and update finalsBytesUsed
	const totalFinalsSize = (finalFilesResponse.Contents || []).reduce((sum, obj) => sum + (obj.Size || 0), 0);
	if (totalFinalsSize > 0) {
		try {
			await ddb.send(new UpdateCommand({
				TableName: galleriesTable,
				Key: { galleryId },
				UpdateExpression: 'ADD finalsBytesUsed :size',
				ExpressionAttributeValues: {
					':size': totalFinalsSize
				}
			}));
			logger?.info('Updated gallery finalsBytesUsed', { galleryId, sizeAdded: totalFinalsSize });
		} catch (updateErr: any) {
			logger?.warn('Failed to update gallery finalsBytesUsed', {
				error: updateErr.message,
				galleryId,
				size: totalFinalsSize
			});
		}
	}

	// If no final photos exist, nothing to process
	if (finalFiles.length === 0) {
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'No final photos found, nothing to process' })
		};
	}

	// Update order status to PREPARING_DELIVERY if needed (do this FIRST, before any early returns)
	// CLIENT_APPROVED → PREPARING_DELIVERY (selection galleries)
	// AWAITING_FINAL_PHOTOS → PREPARING_DELIVERY (non-selection galleries)
	// Also handle undefined/null status (legacy orders)
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
				logger?.warn('Order status changed between check and update - continuing with cleanup', {
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
				// Don't throw - status update failure shouldn't prevent cleanup
			}
		}
	} else {
		logger?.info('Status update not needed - order already in correct status', {
			galleryId,
			orderId,
			currentDeliveryStatus: order.deliveryStatus
		});
	}

	// Check if originals still exist (if not, cleanup already happened)
	const originalsPrefix = `galleries/${galleryId}/originals/`;
	const originalsResponse = await s3.send(new ListObjectsV2Command({
		Bucket: bucket,
		Prefix: originalsPrefix,
		MaxKeys: 1 // Just check if any exist
	}));
	const originalsExist = (originalsResponse.Contents || []).length > 0;

	// If originals don't exist, cleanup already happened - nothing to do
	if (!originalsExist) {
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				message: 'Originals already cleaned up',
				finalFilesCount: finalFiles.length
			})
		};
	}

	// Check if cleanup has already been completed (prevents abuse)
	// This flag is set when cleanup succeeds, preventing multiple cleanup attempts
	const finalsCleanupDone = order?.finalsCleanupDone === true;

	if (finalsCleanupDone) {
		// Cleanup already completed - nothing to do
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				message: 'Cleanup already completed',
				finalFilesCount: finalFiles.length
			})
		};
	}

	// Check order status to determine if this is the first time finals were uploaded
	// If status is already PREPARING_FOR_DELIVERY or DELIVERED, cleanup should have happened
	// Only process if status indicates finals were just uploaded
	const shouldProcessCleanup = order.deliveryStatus === 'CLIENT_APPROVED' || order.deliveryStatus === 'AWAITING_FINAL_PHOTOS';

	// Only proceed if order status indicates this is the first time finals are being uploaded
	// If status is already PREPARING_FOR_DELIVERY or DELIVERED, cleanup should have happened already
	if (!shouldProcessCleanup) {
		// Status already updated but cleanup flag not set - might have failed before
		// Only proceed if originals still exist (cleanup didn't complete)
		if (!originalsExist) {
			// Originals already cleaned up but flag not set - set the flag now
			await ddb.send(new UpdateCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId },
				UpdateExpression: 'SET finalsCleanupDone = :fcd',
				ExpressionAttributeValues: {
					':fcd': true
				}
			}));
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					message: 'Originals already cleaned up, flag updated',
					deliveryStatus: order.deliveryStatus,
					finalFilesCount: finalFiles.length
				})
			};
		}
		// Originals still exist but status suggests cleanup should have happened
		// This is a recovery case - proceed with cleanup
		logger?.warn('Originals still exist but order status suggests cleanup should have happened - proceeding with cleanup', {
			galleryId,
			orderId,
			deliveryStatus: order.deliveryStatus,
			finalFilesCount: finalFiles.length
		});
	}

	// Cleanup originals (always delete after finals upload)
	// Keep thumbnails and previews for display purposes
	// ZIPs are generated on-demand only, originals should be removed to save storage
	const selectedKeys: string[] = order?.selectedKeys && Array.isArray(order.selectedKeys) ? order.selectedKeys : [];
	
	// Validation: If gallery has selection enabled but selectedKeys is empty, this is an error
	// For selection galleries, selectedKeys should always be populated
	if (gallery.selectionEnabled && selectedKeys.length === 0) {
		logger?.error('Selection gallery has empty selectedKeys - skipping cleanup to prevent data loss', {
			galleryId,
			orderId,
			selectionEnabled: gallery.selectionEnabled,
			selectedKeysLength: selectedKeys.length
		});
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Invalid order state: selection gallery has no selected keys',
				message: 'Cannot cleanup originals for selection gallery without selected keys'
			})
		};
	}
	
	let keysToDelete: string[] = selectedKeys;
	
	// If selectedKeys is empty (non-selection galleries), list all originals from S3
	if (selectedKeys.length === 0) {
		try {
			const originalsPrefix = `galleries/${galleryId}/originals/`;
			const originalsListResponse = await s3.send(new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: originalsPrefix
			}));
			keysToDelete = (originalsListResponse.Contents || [])
				.map(obj => {
					const fullKey = obj.Key || '';
					return fullKey.replace(originalsPrefix, '');
				})
				.filter((key): key is string => Boolean(key));
		} catch (listErr: any) {
			logger?.error('Failed to list originals for deletion', {
				error: listErr.message,
				galleryId,
				orderId
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Failed to list originals for cleanup',
					message: listErr.message
				})
			};
		}
	}
	
	if (keysToDelete.length > 0) {
		try {
			const toDelete: { Key: string }[] = [];
			for (const key of keysToDelete) {
				// Only delete originals - keep thumbnails and previews for display purposes
				// This allows showing "Wybrane" previews even after originals are removed
				toDelete.push({ Key: `galleries/${galleryId}/originals/${key}` });
				// DO NOT delete thumbs and previews - they're needed for display
			}

			// Batch delete (S3 allows up to 1000 objects per request)
			for (let i = 0; i < toDelete.length; i += 1000) {
				const chunk = toDelete.slice(i, i + 1000);
				await s3.send(new DeleteObjectsCommand({
					Bucket: bucket,
					Delete: { Objects: chunk }
				}));
			}
			logger?.info('Cleaned up originals (final photos uploaded) - kept thumbnails and previews', { 
				galleryId, 
				orderId, 
				count: keysToDelete.length 
			});

			// Mark cleanup as completed to prevent future attempts
			// Use conditional update to prevent race condition (only set if not already set)
			// This prevents abuse: if user uploads more photos later, cleanup won't run again
			try {
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'SET finalsCleanupDone = :fcd',
					ConditionExpression: 'attribute_not_exists(finalsCleanupDone) OR finalsCleanupDone = :false',
					ExpressionAttributeValues: {
						':fcd': true,
						':false': false
					}
				}));
				logger?.info('Marked finals cleanup as done', { galleryId, orderId });
			} catch (flagErr: any) {
				// If flag was already set (race condition), log and continue
				if (flagErr.name === 'ConditionalCheckFailedException') {
					logger?.warn('Cleanup flag already set (race condition) - continuing', {
						galleryId,
						orderId
					});
				} else {
					throw flagErr;
				}
			}
		} catch (err: any) {
			// Cleanup failed - return error instead of success
			// Don't set the flag if cleanup failed - allows retry
			logger?.error('Failed to clean up originals', {
				error: err.message,
				galleryId,
				orderId,
				keysToDeleteCount: keysToDelete.length
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Cleanup failed',
					message: 'Failed to delete originals. Please retry.',
					details: err.message
				})
			};
		}
	} else {
		// No files to delete, but mark cleanup as done anyway
		await ddb.send(new UpdateCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId },
			UpdateExpression: 'SET finalsCleanupDone = :fcd',
			ExpressionAttributeValues: {
				':fcd': true
			}
		}));
		logger?.info('No files to delete, marked cleanup as done', { galleryId, orderId });
	}

	logger?.info('Upload completion processed successfully - originals cleaned up', {
		galleryId,
		orderId,
		finalFilesCount: finalFiles.length,
		cleanupCount: keysToDelete.length,
		statusUpdated: order.deliveryStatus === 'CLIENT_APPROVED' || order.deliveryStatus === 'AWAITING_FINAL_PHOTOS'
	});

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			message: 'Upload completion processed successfully',
			statusUpdated: order.deliveryStatus === 'CLIENT_APPROVED' || order.deliveryStatus === 'AWAITING_FINAL_PHOTOS',
			cleanupCount: keysToDelete.length,
			finalFilesCount: finalFiles.length
		})
	};
});

