import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * S3 event handler for PUT operations (file uploads)
 * Updates bytesUsed atomically when files are uploaded to S3
 * 
 * Handles:
 * - Original images: galleries/{galleryId}/originals/{filename}
 * - Final images: galleries/{galleryId}/final/{orderId}/{filename}
 * 
 * Ignores:
 * - Thumbnails, previews, bigthumbs (not counted in bytesUsed)
 * - Other paths
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;

	if (!bucket || !galleriesTable) {
		logger?.error('Missing required environment variables', { bucket: !!bucket, galleriesTable: !!galleriesTable });
		return;
	}

	// Process S3 events (can be single event or batch)
	const records = event.Records || [];
	
	logger?.info('Processing S3 PUT events', { recordCount: records.length });

	// Group uploads by gallery to batch updates
	const galleryUploads = new Map<string, { originals: number; finals: number }>();

	for (const record of records) {
		try {
			// Extract S3 object information
			const s3Event = record.s3;
			if (!s3Event || !s3Event.object || !s3Event.bucket) {
				logger?.warn('Invalid S3 event record', { record });
				continue;
			}

			const objectKey = decodeURIComponent(s3Event.object.key.replace(/\+/g, ' '));
			const bucketName = s3Event.bucket.name;

			// Only process files in our bucket
			if (bucketName !== bucket) {
				logger?.warn('Event from different bucket, ignoring', { bucketName, expectedBucket: bucket });
				continue;
			}

			// Parse gallery ID and file type from key
			// Originals: galleries/{galleryId}/originals/{filename}
			// Finals: galleries/{galleryId}/final/{orderId}/{filename}
			const originalsMatch = objectKey.match(/^galleries\/([^\/]+)\/originals\/(.+)$/);
			const finalsMatch = objectKey.match(/^galleries\/([^\/]+)\/final\/[^\/]+\/(.+)$/);

			// Skip thumbnails, previews, bigthumbs (not counted in bytesUsed)
			if (objectKey.includes('/thumbs/') || 
			    objectKey.includes('/previews/') || 
			    objectKey.includes('/bigthumbs/')) {
				continue;
			}

			let galleryId: string | null = null;
			let isOriginal = false;
			let isFinal = false;

			if (originalsMatch) {
				galleryId = originalsMatch[1];
				isOriginal = true;
			} else if (finalsMatch) {
				galleryId = finalsMatch[1];
				isFinal = true;
			}

			// Only process originals and finals
			if (!galleryId || (!isOriginal && !isFinal)) {
				continue;
			}

			// Get file size from S3
			let fileSize = 0;
			try {
				const headResponse = await s3.send(new HeadObjectCommand({
					Bucket: bucket,
					Key: objectKey
				}));
				fileSize = headResponse.ContentLength || 0;
			} catch (headErr: any) {
				logger?.warn('Failed to get file size from S3', {
					error: headErr.message,
					objectKey,
					galleryId
				});
				continue;
			}

			if (fileSize <= 0) {
				logger?.warn('File size is 0 or negative, skipping', { objectKey, galleryId });
				continue;
			}

			// Accumulate file sizes by gallery
			if (!galleryUploads.has(galleryId)) {
				galleryUploads.set(galleryId, { originals: 0, finals: 0 });
			}
			const uploads = galleryUploads.get(galleryId)!;
			if (isOriginal) {
				uploads.originals += fileSize;
			} else if (isFinal) {
				uploads.finals += fileSize;
			}

			logger?.info('Processed S3 PUT event', {
				galleryId,
				objectKey,
				fileSize,
				type: isOriginal ? 'original' : 'final'
			});
		} catch (err: any) {
			logger?.error('Failed to process S3 PUT event', {
				error: err.message,
				record
			});
			// Continue processing other records
		}
	}

	// Update bytesUsed atomically for all affected galleries
	for (const [galleryId, uploads] of galleryUploads.entries()) {
		try {
			const updateExpressions: string[] = [];
			const expressionValues: Record<string, number> = {};

			if (uploads.originals > 0) {
				updateExpressions.push('originalsBytesUsed :originalsSize');
				expressionValues[':originalsSize'] = uploads.originals;
			}

			if (uploads.finals > 0) {
				updateExpressions.push('finalsBytesUsed :finalsSize');
				expressionValues[':finalsSize'] = uploads.finals;
			}

			// Also update bytesUsed for backward compatibility (sum of both)
			if (uploads.originals > 0 || uploads.finals > 0) {
				const totalSize = uploads.originals + uploads.finals;
				updateExpressions.push('bytesUsed :totalSize');
				expressionValues[':totalSize'] = totalSize;
			}

			if (updateExpressions.length > 0) {
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: `ADD ${updateExpressions.join(', ')}`,
					ExpressionAttributeValues: expressionValues
				}));

				logger?.info('Updated gallery bytesUsed after S3 PUT (atomic)', {
					galleryId,
					originalsAdded: uploads.originals,
					finalsAdded: uploads.finals,
					totalAdded: uploads.originals + uploads.finals
				});
			}
		} catch (updateErr: any) {
			logger?.warn('Failed to update gallery bytesUsed after S3 PUT', {
				error: updateErr.message,
				galleryId,
				originalsAdded: uploads.originals,
				finalsAdded: uploads.finals
			});
			// Don't fail the entire batch - bytesUsed update is important but not critical
		}
	}

	logger?.info('S3 PUT event processing completed', {
		recordsProcessed: records.length,
		galleriesUpdated: galleryUploads.size
	});
});

