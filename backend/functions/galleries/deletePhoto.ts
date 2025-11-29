import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { recalculateStorageInternal } from './recalculateBytesUsed';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!galleriesTable || !bucket) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const filename = event?.pathParameters?.filename;

	if (!galleryId || !filename) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId and filename are required' })
		};
	}

	// Get gallery to verify access
	const galleryGet = await ddb.send(new GetCommand({
		TableName: galleriesTable,
		Key: { galleryId }
	}));

	const gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}

	// Verify access: Only photographer (owner) can delete photos
	const access = verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner) {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Forbidden: Only gallery owner can delete photos' })
		};
	}

	// Helper to convert filename to WebP (previews/thumbs are stored as WebP)
	const getWebpFilename = (fname: string): string => {
		const lastDot = fname.lastIndexOf('.');
		if (lastDot === -1) return `${fname}.webp`;
		return `${fname.substring(0, lastDot)}.webp`;
	};

	// Construct S3 keys
	// Originals keep original extension (PNG/JPEG), but previews/thumbs are WebP
	const originalKey = `galleries/${galleryId}/originals/${filename}`;
	const webpFilename = getWebpFilename(filename);
	const previewKey = `galleries/${galleryId}/previews/${webpFilename}`;
	const thumbKey = `galleries/${galleryId}/thumbs/${webpFilename}`;

	// Get original file size before deletion
	let fileSize = 0;
	try {
		const headResponse = await s3.send(new HeadObjectCommand({
			Bucket: bucket,
			Key: originalKey
		}));
		fileSize = headResponse.ContentLength || 0;
	} catch (err: any) {
		if (err.name !== 'NotFound') {
			logger.warn('Failed to get file size', { error: err.message, originalKey });
		}
	}

	// Delete from S3 (originals, previews, thumbs)
	const deleteResults = await Promise.allSettled([
		s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: originalKey })),
		s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: previewKey })),
		s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey }))
	]);

	const deleteErrors = deleteResults.filter(r => r.status === 'rejected');
	if (deleteErrors.length > 0) {
		logger.warn('Some files failed to delete', {
			errors: deleteErrors.map(e => (e as PromiseRejectedResult).reason),
			galleryId,
			filename
		});
	}

	// Update gallery originalsBytesUsed by subtracting deleted file size
	// Also update bytesUsed for backward compatibility
	// Use atomic ADD operation to prevent race conditions with concurrent deletions
	let updatedGallery: any;
	if (fileSize > 0) {
		try {
			const currentOriginalsBytesUsed = gallery.originalsBytesUsed || 0;
			const currentBytesUsed = gallery.bytesUsed || 0;
			
			// Use atomic ADD with negative value to handle concurrent deletions safely
			// This prevents race conditions where multiple deletions overwrite each other
			await ddb.send(new UpdateCommand({
				TableName: galleriesTable,
				Key: { galleryId },
				UpdateExpression: 'ADD originalsBytesUsed :negativeSize, bytesUsed :negativeSize',
				ExpressionAttributeValues: {
					':negativeSize': -fileSize
				}
			}));
			
			// After atomic update, check if value went negative and correct it if needed
			// This handles edge cases where the field might have been out of sync
			// Store result for reuse at end of function
			const galleryGetAfterUpdate = await ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			}));
			updatedGallery = galleryGetAfterUpdate;
			
			const updatedOriginalsBytesUsed = updatedGallery.Item?.originalsBytesUsed || 0;
			const updatedBytesUsed = updatedGallery.Item?.bytesUsed || 0;
			
			// If value went negative (shouldn't happen, but handle edge cases), set to 0
			if (updatedOriginalsBytesUsed < 0 || updatedBytesUsed < 0) {
				logger.warn('originalsBytesUsed went negative after atomic update, correcting', {
					galleryId,
					updatedOriginalsBytesUsed,
					updatedBytesUsed,
					sizeRemoved: fileSize,
					previousOriginalsBytesUsed: currentOriginalsBytesUsed
				});
				
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET originalsBytesUsed = :zero, bytesUsed = :zero',
					ExpressionAttributeValues: {
						':zero': 0
					}
				}));
				
				// Update the cached gallery value after correction
				if (updatedGallery.Item) {
					updatedGallery.Item.originalsBytesUsed = 0;
					updatedGallery.Item.bytesUsed = 0;
				}
			}
			
			logger.info('Updated gallery originalsBytesUsed (atomic)', { 
				galleryId, 
				sizeRemoved: fileSize,
				oldOriginalsBytesUsed: currentOriginalsBytesUsed,
				newOriginalsBytesUsed: Math.max(0, updatedOriginalsBytesUsed)
			});
		} catch (updateErr: any) {
			logger.warn('Failed to update gallery originalsBytesUsed', {
				error: updateErr.message,
				galleryId,
				size: fileSize
			});
		}
	} else {
		// File not found in S3 - originalsBytesUsed might be out of sync
		// Trigger automatic recalculation (debounced internally)
		logger.info('File not found in S3, triggering automatic storage recalculation', {
			galleryId,
			filename,
			currentOriginalsBytesUsed: gallery.originalsBytesUsed || 0
		});
		
		// Trigger recalculation asynchronously (fire and forget to avoid blocking deletion)
		// The recalculation function has built-in debouncing to prevent excessive calls
		(async () => {
			try {
				// Check debounce before calling (5 minute debounce)
				const now = Date.now();
				const lastRecalculatedAt = gallery.lastBytesUsedRecalculatedAt 
					? new Date(gallery.lastBytesUsedRecalculatedAt).getTime() 
					: 0;
				const RECALCULATE_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes
				
				if (now - lastRecalculatedAt >= RECALCULATE_DEBOUNCE_MS) {
					await recalculateStorageInternal(galleryId, galleriesTable, bucket, gallery, logger);
				} else {
					logger.info('Automatic recalculation skipped (debounced)', {
						galleryId,
						timeSinceLastRecalculation: now - lastRecalculatedAt
					});
				}
			} catch (recalcErr: any) {
				// Log but don't fail deletion if recalculation fails
				logger.warn('Automatic recalculation failed', {
					error: recalcErr?.message,
					galleryId
				});
			}
		})();
	}

	// Get updated gallery to return current storage usage (only if not already fetched)
	if (!updatedGallery) {
		updatedGallery = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));
	}

	const updatedOriginalsBytesUsed = Math.max(updatedGallery.Item?.originalsBytesUsed || 0, 0);
	const updatedBytesUsed = Math.max(updatedGallery.Item?.bytesUsed || 0, 0); // Backward compatibility
	const originalsLimitBytes = updatedGallery.Item?.originalsLimitBytes || 0;

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			message: 'Photo deleted successfully',
			galleryId,
			filename,
			originalsBytesUsed: updatedOriginalsBytesUsed,
			bytesUsed: updatedBytesUsed, // Backward compatibility
			originalsLimitBytes,
			originalsUsedMB: (updatedOriginalsBytesUsed / (1024 * 1024)).toFixed(2),
			originalsLimitMB: (originalsLimitBytes / (1024 * 1024)).toFixed(2)
		})
	};
});

