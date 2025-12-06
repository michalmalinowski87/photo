import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

	// Only allow cleanup for selection galleries
	if (gallery.selectionEnabled === false) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Cleanup only available for selection galleries',
				message: 'Originals cleanup is only available for galleries with selection enabled'
			})
		};
	}

	// Get order to retrieve selected keys
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

	const selectedKeys: string[] = order?.selectedKeys && Array.isArray(order.selectedKeys) ? order.selectedKeys : [];

	if (selectedKeys.length === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'No selected keys',
				message: 'Cannot cleanup originals: no selected keys found in order'
			})
		};
	}

	// Helper to convert filename to WebP (previews/thumbs are stored as WebP)
	const getWebpFilename = (fname: string): string => {
		const lastDot = fname.lastIndexOf('.');
		if (lastDot === -1) return `${fname}.webp`;
		return `${fname.substring(0, lastDot)}.webp`;
	};

	// Get sizes of original files before deletion (for updating originalsBytesUsed)
	let totalOriginalsSize = 0;
	for (const key of selectedKeys) {
		const originalKey = `galleries/${galleryId}/originals/${key}`;
		
		try {
			const headResponse = await s3.send(new HeadObjectCommand({
				Bucket: bucket,
				Key: originalKey
			}));
			totalOriginalsSize += headResponse.ContentLength || 0;
		} catch (err: any) {
			if (err.name !== 'NotFound') {
				logger?.warn('Failed to get original file size', { 
					error: err.message, 
					originalKey,
					galleryId,
					orderId
				});
			}
			// If file not found, continue - it might have been deleted already
		}
	}

	// Prepare files to delete: originals, previews, thumbnails, and bigthumbs
	const toDelete: { Key: string }[] = [];
	for (const key of selectedKeys) {
		// Delete original (keeps original extension)
		toDelete.push({ Key: `galleries/${galleryId}/originals/${key}` });
		
		// Delete preview (WebP format)
		const webpFilename = getWebpFilename(key);
		toDelete.push({ Key: `galleries/${galleryId}/previews/${webpFilename}` });
		
		// Delete thumbnail (WebP format)
		toDelete.push({ Key: `galleries/${galleryId}/thumbs/${webpFilename}` });
		
		// Delete bigthumb (WebP format)
		toDelete.push({ Key: `galleries/${galleryId}/bigthumbs/${webpFilename}` });
	}

	// Batch delete (S3 allows up to 1000 objects per request)
	let deletedCount = 0;
	try {
		for (let i = 0; i < toDelete.length; i += 1000) {
			const chunk = toDelete.slice(i, i + 1000);
			const deleteResponse = await s3.send(new DeleteObjectsCommand({
				Bucket: bucket,
				Delete: { Objects: chunk }
			}));
			deletedCount += deleteResponse.Deleted?.length || 0;
		}

		// Update gallery originalsBytesUsed by subtracting deleted originals size
		// Use atomic ADD operation to prevent race conditions with concurrent deletions
		if (totalOriginalsSize > 0) {
			try {
				const currentOriginalsBytesUsed = gallery.originalsBytesUsed || 0;
				
				// Use atomic ADD with negative value to handle concurrent deletions safely
				// This prevents race conditions where cleanup and single deletions happen simultaneously
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'ADD originalsBytesUsed :negativeSize',
					ExpressionAttributeValues: {
						':negativeSize': -totalOriginalsSize
					}
				}));
				
				// After atomic update, check if value went negative and correct it if needed
				const updatedGallery = await ddb.send(new GetCommand({
					TableName: galleriesTable,
					Key: { galleryId }
				}));
				
				const updatedOriginalsBytesUsed = updatedGallery.Item?.originalsBytesUsed || 0;
				
				// If value went negative (shouldn't happen, but handle edge cases), set to 0
				if (updatedOriginalsBytesUsed < 0) {
					logger?.warn('originalsBytesUsed went negative after atomic cleanup update, correcting', {
						galleryId,
						orderId,
						updatedOriginalsBytesUsed,
						sizeRemoved: totalOriginalsSize,
						previousOriginalsBytesUsed: currentOriginalsBytesUsed
					});
					
					await ddb.send(new UpdateCommand({
						TableName: galleriesTable,
						Key: { galleryId },
						UpdateExpression: 'SET originalsBytesUsed = :zero',
						ExpressionAttributeValues: {
							':zero': 0
						}
					}));
				}
				
				logger?.info('Updated gallery originalsBytesUsed after cleanup (atomic)', { 
					galleryId, 
					orderId,
					sizeRemoved: totalOriginalsSize,
					oldOriginalsBytesUsed: currentOriginalsBytesUsed,
					newOriginalsBytesUsed: Math.max(0, updatedOriginalsBytesUsed),
					selectedKeysCount: selectedKeys.length
				});
			} catch (updateErr: any) {
				logger?.warn('Failed to update gallery originalsBytesUsed after cleanup', {
					error: updateErr.message,
					galleryId,
					orderId,
					size: totalOriginalsSize
				});
				// Continue even if update fails - files are already deleted
			}
		} else {
			// No files found or sizes couldn't be determined - originalsBytesUsed might be out of sync
			logger?.info('No original file sizes found, originalsBytesUsed might be out of sync', {
				galleryId,
				orderId,
				selectedKeysCount: selectedKeys.length,
				currentOriginalsBytesUsed: gallery.originalsBytesUsed || 0
			});
		}

		logger?.info('Cleaned up originals, previews, thumbnails, and bigthumbs', { 
			galleryId, 
			orderId, 
			selectedKeysCount: selectedKeys.length,
			deletedCount,
			totalOriginalsSizeRemoved: totalOriginalsSize
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				message: 'Originals, previews, thumbnails, and bigthumbs cleaned up successfully',
				galleryId,
				orderId,
				selectedKeysCount: selectedKeys.length,
				deletedCount,
				originalsSizeRemoved: totalOriginalsSize
			})
		};
	} catch (err: any) {
		logger?.error('Failed to clean up originals', {
			error: err.message,
			galleryId,
			orderId,
			selectedKeysCount: selectedKeys.length
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Cleanup failed',
				message: 'Failed to delete originals, previews, thumbnails, and bigthumbs. Please retry.',
				details: err.message
			})
		};
	}
});

