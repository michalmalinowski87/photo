import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!galleriesTable || !ordersTable || !bucket) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	const filename = event?.pathParameters?.filename;

	if (!galleryId || !orderId || !filename) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId, orderId, and filename are required' })
		};
	}

	// Decode filename (URL encoded)
	const decodedFilename = decodeURIComponent(filename);

	// Verify gallery exists and user is owner
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

	// Verify order exists
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

	// Helper to convert filename to WebP (previews/thumbs are stored as WebP)
	const getWebpFilename = (fname: string): string => {
		const lastDot = fname.lastIndexOf('.');
		if (lastDot === -1) return `${fname}.webp`;
		return `${fname.substring(0, lastDot)}.webp`;
	};

	// Construct S3 keys for final image and its previews/thumbs
	// Final images are stored at: galleries/{galleryId}/final/{orderId}/{filename}
	const finalImageKey = `galleries/${galleryId}/final/${orderId}/${decodedFilename}`;
	const webpFilename = getWebpFilename(decodedFilename);
	const previewKey = `galleries/${galleryId}/final/${orderId}/previews/${webpFilename}`;
	const thumbKey = `galleries/${galleryId}/final/${orderId}/thumbs/${webpFilename}`;

	// Get final image file size before deletion (for updating finalsBytesUsed)
	let fileSize = 0;
	try {
		const headResponse = await s3.send(new HeadObjectCommand({
			Bucket: bucket,
			Key: finalImageKey
		}));
		fileSize = headResponse.ContentLength || 0;
	} catch (err: any) {
		if (err.name !== 'NotFound') {
			logger?.warn('Failed to get final image file size', { 
				error: err.message, 
				finalImageKey,
				galleryId,
				orderId
			});
		}
		// If file not found, continue - it might have been deleted already
	}

	// Delete final image, preview, and thumb from S3
	const deleteResults = await Promise.allSettled([
		s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: finalImageKey })),
		s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: previewKey })),
		s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey }))
	]);

	const deleteErrors = deleteResults.filter(r => r.status === 'rejected');
	if (deleteErrors.length > 0) {
		logger?.warn('Some files failed to delete', {
			errors: deleteErrors.map(e => (e as PromiseRejectedResult).reason),
			galleryId,
			orderId,
			filename: decodedFilename
		});
		// Check if the main final image deletion failed
		if (deleteResults[0].status === 'rejected') {
			const error = (deleteResults[0] as PromiseRejectedResult).reason;
			logger?.error('Failed to delete final image from S3', {
				error: error instanceof Error ? error.message : String(error),
				galleryId,
				orderId,
				filename: decodedFilename,
				s3Key: finalImageKey
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Failed to delete final image', message: error instanceof Error ? error.message : String(error) })
			};
		}
	}

	logger?.info('Deleted final image, preview, and thumb', { 
		galleryId, 
		orderId, 
		filename: decodedFilename, 
		finalImageKey,
		previewKey,
		thumbKey
	});

	// Update gallery finalsBytesUsed by subtracting deleted final image size
	// Also update bytesUsed for backward compatibility
	// Use atomic ADD operation to prevent race conditions with concurrent deletions
	if (fileSize > 0) {
		try {
			const currentFinalsBytesUsed = gallery.finalsBytesUsed || 0;
			const currentBytesUsed = gallery.bytesUsed || 0;
			
			// Use atomic ADD with negative value to handle concurrent deletions safely
			// This prevents race conditions where multiple deletions overwrite each other
			await ddb.send(new UpdateCommand({
				TableName: galleriesTable,
				Key: { galleryId },
				UpdateExpression: 'ADD finalsBytesUsed :negativeSize, bytesUsed :negativeSize',
				ExpressionAttributeValues: {
					':negativeSize': -fileSize
				}
			}));
			
			// After atomic update, check if value went negative and correct it if needed
			const updatedGallery = await ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			}));
			
			const updatedFinalsBytesUsed = updatedGallery.Item?.finalsBytesUsed || 0;
			const updatedBytesUsed = updatedGallery.Item?.bytesUsed || 0;
			
			// If value went negative (shouldn't happen, but handle edge cases), set to 0
			if (updatedFinalsBytesUsed < 0 || updatedBytesUsed < 0) {
				logger?.warn('finalsBytesUsed went negative after atomic update, correcting', {
					galleryId,
					orderId,
					updatedFinalsBytesUsed,
					updatedBytesUsed,
					sizeRemoved: fileSize,
					previousFinalsBytesUsed: currentFinalsBytesUsed
				});
				
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET finalsBytesUsed = :zero, bytesUsed = :zero',
					ExpressionAttributeValues: {
						':zero': 0
					}
				}));
			}
			
			logger?.info('Updated gallery finalsBytesUsed (atomic)', { 
				galleryId, 
				orderId,
				sizeRemoved: fileSize,
				oldFinalsBytesUsed: currentFinalsBytesUsed,
				newFinalsBytesUsed: Math.max(0, updatedFinalsBytesUsed)
			});
		} catch (updateErr: any) {
			logger?.warn('Failed to update gallery finalsBytesUsed', {
				error: updateErr.message,
				galleryId,
				orderId,
				size: fileSize
			});
			// Continue even if update fails - files are already deleted
		}
	}

	// Check if this was the last final image
	// If so, revert order status back to the appropriate status
	const finalPrefix = `galleries/${galleryId}/final/${orderId}/`;
	const listResponse = await s3.send(new ListObjectsV2Command({
		Bucket: bucket,
		Prefix: finalPrefix
	}));

	const remainingFinals = (listResponse.Contents || []).filter(obj => {
		const key = obj.Key || '';
		// Only count files directly under the prefix, not subdirectories
		return key.startsWith(finalPrefix) && key !== finalPrefix && !key.substring(finalPrefix.length).includes('/');
	});

	// If no finals remain and order is in PREPARING_DELIVERY, revert status
	if (remainingFinals.length === 0 && order.deliveryStatus === 'PREPARING_DELIVERY') {
		// Determine the appropriate status to revert to based on gallery type
		// Selection galleries: CLIENT_APPROVED
		// Non-selection galleries: AWAITING_FINAL_PHOTOS
		const targetStatus = gallery.selectionEnabled !== false ? 'CLIENT_APPROVED' : 'AWAITING_FINAL_PHOTOS';
		
		try {
			await ddb.send(new UpdateCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId },
				UpdateExpression: 'SET deliveryStatus = :ds',
				ConditionExpression: 'deliveryStatus = :currentStatus',
				ExpressionAttributeValues: {
					':ds': targetStatus,
					':currentStatus': 'PREPARING_DELIVERY'
				}
			}));
			logger?.info('Reverted order status after deleting last final', {
				galleryId,
				orderId,
				previousStatus: 'PREPARING_DELIVERY',
				newStatus: targetStatus,
				selectionEnabled: gallery.selectionEnabled
			});
		} catch (updateErr: any) {
			// If status changed between check and update, log and continue
			if (updateErr.name === 'ConditionalCheckFailedException') {
				logger?.warn('Order status changed between check and update', {
					galleryId,
					orderId,
					expectedStatus: 'PREPARING_DELIVERY'
				});
			} else {
				logger?.error('Failed to revert order status', {
					error: updateErr.message,
					galleryId,
					orderId
				});
				// Don't fail the deletion - status update is secondary
			}
		}
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			message: 'Final image deleted successfully',
			galleryId,
			orderId,
			filename: decodedFilename,
			remainingFinalsCount: remainingFinals.length,
			statusReverted: remainingFinals.length === 0 && order.deliveryStatus === 'PREPARING_DELIVERY'
		})
	};
});

