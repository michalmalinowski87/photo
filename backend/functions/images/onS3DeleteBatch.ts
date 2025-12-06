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
 * Returns file size for bytesUsed update (only for original/final files, not thumbnails)
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
		// Get file size BEFORE deletion for bytesUsed update (only count original/final, not thumbnails)
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

		// Collect gallery IDs, track final image deletes, and accumulate file sizes for bytesUsed updates
		results.forEach((result, index) => {
			if (result.status === 'fulfilled' && result.value?.success) {
				const deleteReq = batch[index];
				const deleteResult = result.value;
				processedGalleries.add(deleteResult.galleryId);
				
				// Accumulate file sizes for bytesUsed updates (only count original/final files, not thumbnails)
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

	// Update bytesUsed atomically for all affected galleries
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
				
				// Also update bytesUsed for backward compatibility (sum of both)
				if (bytes.originals > 0 || bytes.finals > 0) {
					const totalNegativeSize = -(bytes.originals + bytes.finals);
					updateExpressions.push('bytesUsed :negativeTotalSize');
					expressionValues[':negativeTotalSize'] = totalNegativeSize;
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
					const updatedBytesUsed = updatedGallery.Item?.bytesUsed || 0;
					
					// If value went negative (shouldn't happen, but handle edge cases), set to 0
					if (updatedOriginalsBytesUsed < 0 || updatedFinalsBytesUsed < 0 || updatedBytesUsed < 0) {
						logger?.warn('bytesUsed went negative after atomic delete update, correcting', {
							galleryId,
							updatedOriginalsBytesUsed,
							updatedFinalsBytesUsed,
							updatedBytesUsed,
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
						if (updatedBytesUsed < 0) {
							setExpressions.push('bytesUsed = :zero');
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
					
					logger?.info('Updated gallery bytesUsed after batch delete (atomic)', {
						galleryId,
						originalsRemoved: bytes.originals,
						finalsRemoved: bytes.finals,
						totalRemoved: bytes.originals + bytes.finals,
						updatedOriginalsBytesUsed: Math.max(0, updatedOriginalsBytesUsed),
						updatedFinalsBytesUsed: Math.max(0, updatedFinalsBytesUsed),
						updatedBytesUsed: Math.max(0, updatedBytesUsed)
					});
				}
			} catch (updateErr: any) {
				logger?.warn('Failed to update gallery bytesUsed after batch delete', {
					error: updateErr.message,
					galleryId,
					originalsRemoved: bytes.originals,
					finalsRemoved: bytes.finals
				});
				// Don't fail the entire batch - bytesUsed update is important but not critical
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

	// bytesUsed is now updated atomically above using ADD operations
	// This provides robust race condition protection and immediate accuracy
	// Storage recalculation (recalculateBytesUsed) is still available for on-demand recalculation
	// and will use the updated bytesUsed values as a starting point

	logger?.info('Batch delete processing completed', {
		totalDeletes: deletes.length,
		galleriesProcessed: processedGalleries.size,
		galleriesWithBytesUpdated: galleryBytesToSubtract.size,
		finalImageDirectoriesChecked: finalImageDeletes.size
	});
});

