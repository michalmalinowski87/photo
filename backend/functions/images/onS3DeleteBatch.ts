import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Helper to convert filename to WebP (previews/thumbs are stored as WebP)
 */
function getWebpFilename(fname: string): string {
	const lastDot = fname.lastIndexOf('.');
	if (lastDot === -1) return `${fname}.webp`;
	return `${fname.substring(0, lastDot)}.webp`;
}

/**
 * Process a single delete operation
 * Returns file size for storage update (only for original/final files, not thumbnails)
 */
async function processDelete(
	deleteRequest: {
		type: 'original' | 'final';
		galleryId: string;
		orderId?: string;
		filename: string;
		originalKey: string;
	},
	bucket: string,
	logger: any
): Promise<{ galleryId: string; success: boolean; fileSize?: number; type: 'original' | 'final' }> {
	const { type, galleryId, orderId, filename, originalKey } = deleteRequest;
	
	try {
		// Get file size BEFORE deletion for storage update (only count original/final, not thumbnails)
		let fileSize = 0;
		try {
			const headResponse = await s3.send(new HeadObjectCommand({
				Bucket: bucket,
				Key: originalKey
			}));
			fileSize = headResponse.ContentLength || 0;
		} catch (headErr: any) {
			if (headErr.name !== 'NotFound') {
				logger?.warn('Failed to get file size before deletion', {
					error: headErr.message,
					galleryId,
					filename,
					type,
					originalKey
				});
			}
			// If file not found, continue - it might have been deleted already
		}

		// Construct S3 keys for all files to delete
		const webpFilename = getWebpFilename(filename);
		let previewKey: string;
		let thumbKey: string;
		let bigThumbKey: string;
		
		if (type === 'original') {
			previewKey = `galleries/${galleryId}/previews/${webpFilename}`;
			thumbKey = `galleries/${galleryId}/thumbs/${webpFilename}`;
			bigThumbKey = `galleries/${galleryId}/bigthumbs/${webpFilename}`;
		} else {
			// Final image
			if (!orderId) {
				logger?.warn('OrderId required for final image delete', { galleryId, filename });
				return { galleryId, success: false, type };
			}
			previewKey = `galleries/${galleryId}/final/${orderId}/previews/${webpFilename}`;
			thumbKey = `galleries/${galleryId}/final/${orderId}/thumbs/${webpFilename}`;
			bigThumbKey = `galleries/${galleryId}/final/${orderId}/bigthumbs/${webpFilename}`;
		}

		// Delete from S3 (original/final, previews, thumbs, bigthumbs)
		const deleteResults = await Promise.allSettled([
			s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: originalKey })),
			s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: previewKey })),
			s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey })),
			s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: bigThumbKey }))
		]);

		const deleteErrors = deleteResults.filter(r => r.status === 'rejected');
		if (deleteErrors.length > 0) {
			logger?.warn('Some files failed to delete', {
				errors: deleteErrors.map(e => (e as PromiseRejectedResult).reason),
				galleryId,
				filename,
				type
			});
		}

		logger?.info('Successfully deleted image and related files', {
			galleryId,
			filename,
			type,
			orderId,
			fileSize
		});

		return { galleryId, success: true, fileSize, type };
	} catch (err: any) {
		logger?.error('Failed to process delete', {
			error: err.message,
			galleryId,
			filename,
			type,
			orderId
		});
		return { galleryId, success: false, type };
	}
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!bucket) {
		logger?.error('Missing GALLERIES_BUCKET environment variable');
		return;
	}

	// Determine event source: SQS (batched) or programmatic call
	// SQS events have Records[].body containing delete operation JSON
	// Programmatic calls have deletes array directly
	const isSQSEvent = event.Records?.[0]?.eventSource === 'aws:sqs' || event.Records?.[0]?.body;
	
	logger?.info('Batch delete Lambda triggered', { 
		sqsRecordCount: event.Records?.length || 0,
		programmaticDeleteCount: event.deletes?.length || 0,
		isSQSEvent,
		isProgrammaticCall: event.isProgrammaticCall === true
	});

	// Extract delete operations from SQS messages or use direct deletes array
	let deletes: any[] = [];
	
	if (isSQSEvent) {
		// SQS event: each record.body contains a delete operation JSON string
		for (const sqsRecord of event.Records || []) {
			try {
				const deleteOp = JSON.parse(sqsRecord.body);
				deletes.push(deleteOp);
			} catch (err: any) {
				logger?.warn('Failed to parse SQS message body', {
					error: err.message,
					bodyPreview: sqsRecord.body?.substring(0, 200)
				});
			}
		}
		logger?.info('Extracted delete operations from SQS messages', {
			sqsRecordCount: event.Records?.length || 0,
			deleteOperationCount: deletes.length
		});
	} else {
		// Programmatic call: deletes array provided directly
		deletes = event.deletes ?? [];
	}
	
	if (deletes.length === 0) {
		logger?.warn('No delete operations to process');
		return;
	}

	// Process deletes in parallel batches for better performance
	// Optimal batch size: 6 (same as upload resize for consistency)
	const BATCH_SIZE = 6;
	const processedGalleries = new Set<string>();
	const finalImageDeletes = new Map<string, Array<{ galleryId: string; orderId: string }>>(); // Track final image deletes by galleryId/orderId
	const galleryBytesToSubtract = new Map<string, { originals: number; finals: number }>(); // Track bytes to subtract per gallery

	for (let i = 0; i < deletes.length; i += BATCH_SIZE) {
		const batch = deletes.slice(i, i + BATCH_SIZE);
		const results = await Promise.allSettled(
			batch.map(deleteReq => processDelete(deleteReq, bucket, logger))
		);

		// Collect gallery IDs, track final image deletes, and accumulate file sizes for storage updates
		results.forEach((result, index) => {
			if (result.status === 'fulfilled' && result.value?.success) {
				const deleteReq = batch[index];
				const deleteResult = result.value;
				processedGalleries.add(deleteResult.galleryId);
				
				// Accumulate file sizes for storage updates (only count original/final files, not thumbnails)
				if (deleteResult.fileSize && deleteResult.fileSize > 0) {
					const galleryId = deleteResult.galleryId;
					if (!galleryBytesToSubtract.has(galleryId)) {
						galleryBytesToSubtract.set(galleryId, { originals: 0, finals: 0 });
					}
					const bytes = galleryBytesToSubtract.get(galleryId)!;
					if (deleteResult.type === 'original') {
						bytes.originals += deleteResult.fileSize;
					} else if (deleteResult.type === 'final') {
						bytes.finals += deleteResult.fileSize;
					}
				}
				
				// Track final image deletes for directory checking
				if (deleteReq.type === 'final' && deleteReq.orderId) {
					const key = `${deleteReq.galleryId}/${deleteReq.orderId}`;
					if (!finalImageDeletes.has(key)) {
						finalImageDeletes.set(key, []);
					}
					finalImageDeletes.get(key)!.push({
						galleryId: deleteReq.galleryId,
						orderId: deleteReq.orderId
					});
				}
			}
		});
	}

	// Update storage usage atomically for all affected galleries
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	if (galleriesTable && galleryBytesToSubtract.size > 0) {
		for (const [galleryId, bytes] of galleryBytesToSubtract.entries()) {
			try {
				// Use atomic ADD operation with negative values to prevent race conditions
				// This safely handles concurrent deletions and uploads
				const updateExpressions: string[] = [];
				const expressionValues: Record<string, number> = {};
				
				if (bytes.originals > 0) {
					updateExpressions.push('originalsBytesUsed :negativeOriginalsSize');
					expressionValues[':negativeOriginalsSize'] = -bytes.originals;
				}
				
				if (bytes.finals > 0) {
					updateExpressions.push('finalsBytesUsed :negativeFinalsSize');
					expressionValues[':negativeFinalsSize'] = -bytes.finals;
				}
				
				
				if (updateExpressions.length > 0) {
					await ddb.send(new UpdateCommand({
						TableName: galleriesTable,
						Key: { galleryId },
						UpdateExpression: `ADD ${updateExpressions.join(', ')}`,
						ExpressionAttributeValues: expressionValues
					}));
					
					// After atomic update, check if value went negative and correct it if needed
					const updatedGallery = await ddb.send(new GetCommand({
						TableName: galleriesTable,
						Key: { galleryId }
					}));
					
					const updatedOriginalsBytesUsed = updatedGallery.Item?.originalsBytesUsed || 0;
					const updatedFinalsBytesUsed = updatedGallery.Item?.finalsBytesUsed || 0;
					
					// If value went negative (shouldn't happen, but handle edge cases), set to 0
					if (updatedOriginalsBytesUsed < 0 || updatedFinalsBytesUsed < 0) {
						logger?.warn('Storage usage went negative after atomic delete update, correcting', {
							galleryId,
							updatedOriginalsBytesUsed,
							updatedFinalsBytesUsed,
							originalsRemoved: bytes.originals,
							finalsRemoved: bytes.finals
						});
						
						const setExpressions: string[] = [];
						const setValues: Record<string, number> = {};
						
						if (updatedOriginalsBytesUsed < 0) {
							setExpressions.push('originalsBytesUsed = :zero');
							setValues[':zero'] = 0;
						}
						if (updatedFinalsBytesUsed < 0) {
							setExpressions.push('finalsBytesUsed = :zero');
							setValues[':zero'] = 0;
						}
						
						if (setExpressions.length > 0) {
							await ddb.send(new UpdateCommand({
								TableName: galleriesTable,
								Key: { galleryId },
								UpdateExpression: `SET ${setExpressions.join(', ')}`,
								ExpressionAttributeValues: setValues
							}));
						}
					}
					
					// Safety check: Verify if gallery has any remaining images in S3
					// If no images remain, ensure storage usage fields are set to 0
					// This catches edge cases where storage might be slightly above 0 when it should be 0
					try {
						const originalsPrefix = `galleries/${galleryId}/originals/`;
						const finalsPrefix = `galleries/${galleryId}/final/`;
						
						// Check originals directory (only count actual image files, not thumbnails/previews)
						const originalsList = await s3.send(new ListObjectsV2Command({
							Bucket: bucket,
							Prefix: originalsPrefix,
							MaxKeys: 1 // Only need to check if any files exist
						}));
						const hasOriginals = (originalsList.Contents || []).some(obj => {
							const key = obj.Key || '';
							// Only count files directly under originals/, not subdirectories
							return key.startsWith(originalsPrefix) &&
								key !== originalsPrefix &&
								!key.substring(originalsPrefix.length).includes('/');
						});
						
						// Check finals directory (only count actual image files, not thumbnails/previews)
						const finalsList = await s3.send(new ListObjectsV2Command({
							Bucket: bucket,
							Prefix: finalsPrefix,
							MaxKeys: 100 // Need to check multiple files to find actual images
						}));
						const hasFinals = (finalsList.Contents || []).some(obj => {
							const key = obj.Key || '';
							// Only count files directly under final/{orderId}/, not subdirectories
							// Match pattern: galleries/{galleryId}/final/{orderId}/{filename}
							// Exclude: previews/, thumbs/, bigthumbs/ subdirectories
							if (!key.startsWith(finalsPrefix) || key === finalsPrefix) {
								return false;
							}
							const relativePath = key.substring(finalsPrefix.length);
							// Should match: {orderId}/{filename} (exactly 2 path segments)
							// Exclude subdirectories like previews/, thumbs/, bigthumbs/
							const pathParts = relativePath.split('/').filter(p => p.length > 0);
							return pathParts.length === 2 &&
								pathParts[0] !== 'previews' &&
								pathParts[0] !== 'thumbs' &&
								pathParts[0] !== 'bigthumbs';
						});
						
						// If no images remain, set storage usage fields to 0
						if (!hasOriginals && !hasFinals) {
							logger?.info('No images remaining in gallery, setting storage usage to 0', {
								galleryId,
								previousOriginalsBytesUsed: updatedOriginalsBytesUsed,
								previousFinalsBytesUsed: updatedFinalsBytesUsed
							});
							
							await ddb.send(new UpdateCommand({
								TableName: galleriesTable,
								Key: { galleryId },
								UpdateExpression: 'SET originalsBytesUsed = :zero, finalsBytesUsed = :zero',
								ExpressionAttributeValues: { ':zero': 0 }
							}));
						} else if (!hasOriginals && updatedOriginalsBytesUsed > 0) {
							// If no originals but originalsBytesUsed > 0, set to 0
							logger?.info('No originals remaining but originalsBytesUsed > 0, correcting', {
								galleryId,
								previousOriginalsBytesUsed: updatedOriginalsBytesUsed
							});
							
							await ddb.send(new UpdateCommand({
								TableName: galleriesTable,
								Key: { galleryId },
								UpdateExpression: 'SET originalsBytesUsed = :zero',
								ExpressionAttributeValues: { ':zero': 0 }
							}));
						} else if (!hasFinals && updatedFinalsBytesUsed > 0) {
							// If no finals but finalsBytesUsed > 0, set to 0
							logger?.info('No finals remaining but finalsBytesUsed > 0, correcting', {
								galleryId,
								previousFinalsBytesUsed: updatedFinalsBytesUsed
							});
							
							await ddb.send(new UpdateCommand({
								TableName: galleriesTable,
								Key: { galleryId },
								UpdateExpression: 'SET finalsBytesUsed = :zero',
								ExpressionAttributeValues: { ':zero': 0 }
							}));
						}
					} catch (s3CheckErr: any) {
						// Log but don't fail - this is a safety check, not critical
						logger?.warn('Failed to verify remaining images in S3 for storage correction', {
							error: s3CheckErr.message,
							galleryId
						});
					}
					
					logger?.info('Updated gallery storage usage after batch delete (atomic)', {
						galleryId,
						originalsRemoved: bytes.originals,
						finalsRemoved: bytes.finals,
						totalRemoved: bytes.originals + bytes.finals,
						updatedOriginalsBytesUsed: Math.max(0, updatedOriginalsBytesUsed),
						updatedFinalsBytesUsed: Math.max(0, updatedFinalsBytesUsed)
					});
				}
			} catch (updateErr: any) {
				logger?.warn('Failed to update gallery storage usage after batch delete', {
					error: updateErr.message,
					galleryId,
					originalsRemoved: bytes.originals,
					finalsRemoved: bytes.finals
				});
				// Don't fail the entire batch - storage update is important but not critical
			}
		}
	}

	// Check directories for final image deletes and update order status if needed
	if (finalImageDeletes.size > 0) {
		const ordersTable = envProc?.env?.ORDERS_TABLE as string;
		
		if (galleriesTable && ordersTable) {
			// Process each unique galleryId/orderId combination
			for (const [_key, deletes] of finalImageDeletes.entries()) {
				if (deletes.length === 0) continue;
				
				const { galleryId, orderId } = deletes[0];
				const finalPrefix = `galleries/${galleryId}/final/${orderId}/`;
				
				try {
					// Check if directory is empty (only count files directly under prefix, not subdirectories)
					const listResponse = await s3.send(new ListObjectsV2Command({
						Bucket: bucket,
						Prefix: finalPrefix,
						MaxKeys: 100 // Only need to check if any files exist
					}));
					
					const remainingFinals = (listResponse.Contents || []).filter(obj => {
						const objKey = obj.Key || '';
						// Only count files directly under the prefix, not subdirectories
						return objKey.startsWith(finalPrefix) && objKey !== finalPrefix && !objKey.substring(finalPrefix.length).includes('/');
					});
					
					// If directory is empty, check if we need to revert order status
					if (remainingFinals.length === 0) {
						// Get order to check current status
						const orderGet = await ddb.send(new GetCommand({
							TableName: ordersTable,
							Key: { galleryId, orderId }
						}));
						
						const order = orderGet.Item as any;
						if (order && order.deliveryStatus === 'PREPARING_DELIVERY') {
							// Get gallery to determine target status
							const galleryGet = await ddb.send(new GetCommand({
								TableName: galleriesTable,
								Key: { galleryId }
							}));
							
							const gallery = galleryGet.Item as any;
							if (gallery) {
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
									}
								}
							}
						}
					}
				} catch (err: any) {
					logger?.warn('Failed to check directory or update order status', {
						error: err.message,
						galleryId,
						orderId
					});
					// Don't fail the entire batch - directory check is secondary
				}
			}
		}
	}

	// Storage usage is now updated atomically above using ADD operations
	// This provides robust race condition protection and immediate accuracy
	// Storage recalculation (recalculateBytesUsed) is still available for on-demand recalculation

	logger?.info('Batch delete processing completed', {
		totalDeletes: deletes.length,
		galleriesProcessed: processedGalleries.size,
		galleriesWithBytesUpdated: galleryBytesToSubtract.size,
		finalImageDirectoriesChecked: finalImageDeletes.size
	});
});

