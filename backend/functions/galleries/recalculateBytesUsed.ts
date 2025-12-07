import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

/**
 * Cache TTL: 5 minutes
 * This balances freshness with performance - DB queries are fast but caching reduces load
 * Critical operations (pay, validateUploadLimits) force recalculation (bypass cache)
 * Display operations use cached values (acceptable to be slightly stale)
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Calculate originals size from S3 by scanning the originals directory
 * @param bucket - S3 bucket name
 * @param galleryId - Gallery ID
 * @returns Total size in bytes of all original images
 */
async function calculateOriginalsSizeFromS3(bucket: string, galleryId: string): Promise<number> {
	let totalSize = 0;
	let continuationToken: string | undefined;
	const prefix = `galleries/${galleryId}/originals/`;

	do {
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			ContinuationToken: continuationToken
		}));

		if (listResponse.Contents) {
			totalSize += listResponse.Contents.reduce((sum, obj) => sum + (obj.Size || 0), 0);
		}

		continuationToken = listResponse.NextContinuationToken;
	} while (continuationToken);

	return totalSize;
}

/**
 * Calculate finals size from S3 by scanning the final directory
 * Excludes previews/thumbs subdirectories - only counts files directly under order directories
 * @param bucket - S3 bucket name
 * @param galleryId - Gallery ID
 * @param logger - Optional logger instance
 * @returns Total size in bytes of all final images
 */
async function calculateFinalsSizeFromS3(bucket: string, galleryId: string, logger?: any): Promise<number> {
	let totalSize = 0;
	let continuationToken: string | undefined;
	const prefix = `galleries/${galleryId}/final/`;

	do {
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			ContinuationToken: continuationToken
		}));

		if (listResponse.Contents) {
			// Only count final images directly under order directories, exclude previews/thumbs in subdirectories
			// Structure: galleries/{galleryId}/final/{orderId}/{filename}
			// We want to exclude: galleries/{galleryId}/final/{orderId}/previews/... and .../thumbs/...
			const filtered = listResponse.Contents.filter(obj => {
				const key = obj.Key || '';
				const relativePath = key.replace(prefix, '');
				// Count only files directly under order directories (not in previews/ or thumbs/ subdirectories)
				// A valid path should be: {orderId}/{filename} with no additional slashes
				const pathParts = relativePath.split('/');
				// Should have exactly 2 parts: orderId and filename
				return pathParts.length === 2 && pathParts[0] && pathParts[1];
			});
			
			totalSize += filtered.reduce((sum, obj) => sum + (obj.Size || 0), 0);
		}

		continuationToken = listResponse.NextContinuationToken;
	} while (continuationToken);

	return totalSize;
}

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

	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId is required' })
		};
	}

	// Verify gallery exists
	const galleryGet = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}

	// Only require auth if called from API (not programmatically)
	const isProgrammaticCall = event?.isProgrammaticCall === true;
	if (!isProgrammaticCall) {
		const requester = getUserIdFromEvent(event);
		requireOwnerOr403(gallery.ownerId, requester);
	}

	// Call the shared recalculation logic (debouncing removed - called explicitly when needed)
	return await recalculateStorageInternal(galleryId, galleriesTable, bucket, gallery, logger);
});

/**
 * Shared recalculation logic that can be called from other functions
 * 
 * @param galleryId - Gallery ID to recalculate
 * @param galleriesTable - DynamoDB table name
 * @param bucket - S3 bucket name
 * @param gallery - Gallery object from DynamoDB (can be undefined, will be fetched if needed)
 * @param logger - Logger instance
 * @param forceRecalc - If true, bypasses cache and forces recalculation (default: false)
 * 
 * @returns Promise with status code and body containing recalculated storage values
 * 
 * Caching behavior:
 * - If forceRecalc is true: Always recalculates from S3
 * - If forceRecalc is false: Checks cache age (5-minute TTL)
 *   - If cache is fresh (< 5 minutes old): Returns cached values
 *   - If cache is stale (>= 5 minutes old): Recalculates from S3
 * 
 * Usage:
 * - Critical operations (pay, validateUploadLimits): forceRecalc = true
 * - Display operations (list galleries, sidebar): forceRecalc = false
 * 
 * Note: Recalculation uses S3 ListObjectsV2Command scans. This is acceptable since:
 * - Recalculation is rare (only when needed for verification/fixing)
 * - Totals are maintained accurately via atomic ADD/SUBTRACT during uploads/deletes
 * - Caching prevents excessive scans for display operations
 */
export async function recalculateStorageInternal(
	galleryId: string,
	galleriesTable: string,
	bucket: string,
	gallery: any,
	logger: any,
	forceRecalc: boolean = false
): Promise<any> {
	// Fetch gallery if not provided
	if (!gallery) {
		const galleryGet = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
		gallery = galleryGet.Item;
		if (!gallery) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery not found' })
			};
		}
	}
	
	// Check cache if not forcing recalculation
	if (!forceRecalc) {
		const lastRecalculatedAt = gallery.lastBytesUsedRecalculatedAt;
		if (lastRecalculatedAt) {
			const cacheAge = Date.now() - new Date(lastRecalculatedAt).getTime();
			if (cacheAge < CACHE_TTL_MS) {
				// Cache is fresh, return cached values
				logger?.info('Using cached storage values', {
					galleryId,
					cacheAgeMs: cacheAge,
					originalsBytesUsed: gallery.originalsBytesUsed || 0,
					finalsBytesUsed: gallery.finalsBytesUsed || 0
				});
				
				return {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						message: 'Storage values (cached)',
						galleryId,
						originalsBytesUsed: gallery.originalsBytesUsed || 0,
						finalsBytesUsed: gallery.finalsBytesUsed || 0,
						originalsLimitBytes: gallery.originalsLimitBytes || 0,
						finalsLimitBytes: gallery.finalsLimitBytes || 0,
						storageLimitBytes: gallery.storageLimitBytes || 0,
						originalsUsedMB: ((gallery.originalsBytesUsed || 0) / (1024 * 1024)).toFixed(2),
						originalsLimitMB: ((gallery.originalsLimitBytes || 0) / (1024 * 1024)).toFixed(2),
						finalsUsedMB: ((gallery.finalsBytesUsed || 0) / (1024 * 1024)).toFixed(2),
						finalsLimitMB: ((gallery.finalsLimitBytes || 0) / (1024 * 1024)).toFixed(2),
						storageUsedMB: (((gallery.originalsBytesUsed || 0) + (gallery.finalsBytesUsed || 0)) / (1024 * 1024)).toFixed(2),
						storageLimitMB: ((gallery.storageLimitBytes || 0) / (1024 * 1024)).toFixed(2),
						cached: true,
						cacheAgeMs: cacheAge
					})
				};
			}
		}
	}
	
	// Cache is stale or forceRecalc is true - recalculate from S3
	logger?.info('Recalculating storage from S3', {
		galleryId,
		forceRecalc,
		cacheAge: gallery.lastBytesUsedRecalculatedAt 
			? Date.now() - new Date(gallery.lastBytesUsedRecalculatedAt).getTime() 
			: 'never'
	});
	
	// Calculate actual sizes from S3 for both originals and finals
	const originalsSize = await calculateOriginalsSizeFromS3(bucket, galleryId);
	const finalsSize = await calculateFinalsSizeFromS3(bucket, galleryId, logger);
	
	logger?.info('Calculated storage sizes from S3', { 
		galleryId, 
		originalsSize, 
		finalsSize
	});

	// Update gallery with both originalsBytesUsed and finalsBytesUsed, and record recalculation timestamp
	const totalBytesUsed = originalsSize + finalsSize;
	const newTimestamp = new Date().toISOString();
	
	// Get current timestamp for conditional update to prevent race conditions
	const currentTimestamp = gallery.lastBytesUsedRecalculatedAt;
	
	try {
		// Use conditional update to prevent race conditions when multiple recalculations run concurrently:
		// Only update if our timestamp is newer than existing, or if no timestamp exists
		// This ensures concurrent recalculations don't overwrite each other
		// The recalculation with the newest timestamp wins, which is correct (most recent DB state)
		await ddb.send(new UpdateCommand({
			TableName: galleriesTable,
			Key: { galleryId },
			UpdateExpression: 'SET originalsBytesUsed = :originalsSize, finalsBytesUsed = :finalsSize, lastBytesUsedRecalculatedAt = :timestamp',
			ConditionExpression: currentTimestamp 
				? 'lastBytesUsedRecalculatedAt < :timestamp OR attribute_not_exists(lastBytesUsedRecalculatedAt)'
				: 'attribute_not_exists(lastBytesUsedRecalculatedAt) OR lastBytesUsedRecalculatedAt < :timestamp',
			ExpressionAttributeValues: {
				':originalsSize': originalsSize,
				':finalsSize': finalsSize,
				':timestamp': newTimestamp
			}
		}));
		logger?.info('Recalculated gallery storage', { 
			galleryId, 
			oldOriginalsBytesUsed: gallery.originalsBytesUsed || 0, 
			newOriginalsBytesUsed: originalsSize,
			oldFinalsBytesUsed: gallery.finalsBytesUsed || 0,
			newFinalsBytesUsed: finalsSize,
			oldBytesUsed: (gallery.originalsBytesUsed || 0) + (gallery.finalsBytesUsed || 0),
			newBytesUsed: totalBytesUsed,
			timestamp: newTimestamp
		});
	} catch (updateErr: any) {
		// Check if this was a conditional check failure (another recalculation won)
		if (updateErr.name === 'ConditionalCheckFailedException') {
			// Get the current state to verify the result
			const updatedGallery = await ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			}));
			
			const storedOriginalsBytes = updatedGallery.Item?.originalsBytesUsed || 0;
			const storedFinalsBytes = updatedGallery.Item?.finalsBytesUsed || 0;
			const storedTotalBytes = storedOriginalsBytes + storedFinalsBytes;
			const calculatedTotalBytes = originalsSize + finalsSize;
			
			// Verify that the stored result matches our calculation (within small tolerance for timing)
			// If there's a significant difference, it means the other recalculation might have missed something
			// In this case, we should retry to ensure accuracy
			const difference = Math.abs(storedTotalBytes - calculatedTotalBytes);
			const tolerance = 1024; // 1KB tolerance for timing differences
			
			if (difference > tolerance) {
				logger?.warn('Recalculation skipped but result mismatch detected - retrying to ensure accuracy', {
					galleryId,
					ourTimestamp: newTimestamp,
					existingTimestamp: currentTimestamp,
					ourCalculatedTotal: calculatedTotalBytes,
					storedTotal: storedTotalBytes,
					difference
				});
				
				// Retry once more with a fresh read of the gallery
				// This ensures we're comparing against the most recent state
				const retryGallery = await ddb.send(new GetCommand({
					TableName: galleriesTable,
					Key: { galleryId }
				}));
				
				if (retryGallery.Item) {
					// Recalculate sizes from S3 again (they should be the same, but ensure we have latest)
					const retryGalleryData = retryGallery.Item as any;
					const retryOriginalsSize = await calculateOriginalsSizeFromS3(bucket, galleryId);
					const retryFinalsSize = await calculateFinalsSizeFromS3(bucket, galleryId, logger);
					const retryTotalBytes = retryOriginalsSize + retryFinalsSize;
					const retryTimestamp = new Date().toISOString();
					
					// Try update again with newer timestamp
					try {
						await ddb.send(new UpdateCommand({
							TableName: galleriesTable,
							Key: { galleryId },
							UpdateExpression: 'SET originalsBytesUsed = :originalsSize, finalsBytesUsed = :finalsSize, lastBytesUsedRecalculatedAt = :timestamp',
							ConditionExpression: 'lastBytesUsedRecalculatedAt < :timestamp OR attribute_not_exists(lastBytesUsedRecalculatedAt)',
							ExpressionAttributeValues: {
								':originalsSize': retryOriginalsSize,
								':finalsSize': retryFinalsSize,
								':timestamp': retryTimestamp
							}
						}));
						logger?.info('Retry recalculation succeeded after mismatch detection', {
							galleryId,
							originalsBytesUsed: retryOriginalsSize,
							finalsBytesUsed: retryFinalsSize
						});
					} catch (retryErr: any) {
						if (retryErr.name === 'ConditionalCheckFailedException') {
							logger?.info('Retry also skipped - another recalculation completed', { galleryId });
						} else {
							logger?.error('Retry recalculation failed', {
								error: retryErr.message,
								galleryId
							});
						}
					}
				}
			} else {
				logger?.info('Recalculation skipped - another concurrent recalculation completed with matching result', {
					galleryId,
					ourTimestamp: newTimestamp,
					existingTimestamp: currentTimestamp,
					ourCalculatedTotal: calculatedTotalBytes,
					storedTotal: storedTotalBytes,
					difference
				});
			}
			
			// Return success but indicate it was skipped
			const finalGallery = await ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			}));
			
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					message: 'Storage recalculation skipped (concurrent recalculation completed)',
					galleryId,
					originalsBytesUsed: finalGallery.Item?.originalsBytesUsed || 0,
					finalsBytesUsed: finalGallery.Item?.finalsBytesUsed || 0,
					skipped: true
				})
			};
		}
		
		logger?.error('Failed to update gallery storage', {
			error: updateErr.message,
			galleryId,
			originalsSize,
			finalsSize,
			errorName: updateErr.name
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to update storage', message: updateErr.message })
		};
	}

	// Get updated gallery to return current storage usage
	const updatedGallery = await ddb.send(new GetCommand({
		TableName: galleriesTable,
		Key: { galleryId }
	}));

	const updatedOriginalsBytesUsed = updatedGallery.Item?.originalsBytesUsed || 0;
	const updatedFinalsBytesUsed = updatedGallery.Item?.finalsBytesUsed || 0;
	const originalsLimitBytes = updatedGallery.Item?.originalsLimitBytes || 0;
	const finalsLimitBytes = updatedGallery.Item?.finalsLimitBytes || 0;
	const storageLimitBytes = updatedGallery.Item?.storageLimitBytes || 0; // Backward compatibility

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			message: 'Storage recalculated successfully',
			galleryId,
			oldOriginalsBytesUsed: gallery.originalsBytesUsed || 0,
			originalsBytesUsed: updatedOriginalsBytesUsed,
			oldFinalsBytesUsed: gallery.finalsBytesUsed || 0,
			finalsBytesUsed: updatedFinalsBytesUsed,
			originalsLimitBytes,
			finalsLimitBytes,
			storageLimitBytes, // Backward compatibility
			originalsUsedMB: (updatedOriginalsBytesUsed / (1024 * 1024)).toFixed(2),
			originalsLimitMB: (originalsLimitBytes / (1024 * 1024)).toFixed(2),
			finalsUsedMB: (updatedFinalsBytesUsed / (1024 * 1024)).toFixed(2),
			finalsLimitMB: (finalsLimitBytes / (1024 * 1024)).toFixed(2),
			storageUsedMB: ((updatedOriginalsBytesUsed + updatedFinalsBytesUsed) / (1024 * 1024)).toFixed(2),
			storageLimitMB: (storageLimitBytes / (1024 * 1024)).toFixed(2)
		})
	};
}

