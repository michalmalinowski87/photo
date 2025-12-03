import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
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
): Promise<{ galleryId: string; success: boolean }> {
	const { type, galleryId, orderId, filename, originalKey } = deleteRequest;
	
	try {
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
				return { galleryId, success: false };
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
			orderId
		});

		return { galleryId, success: true };
	} catch (err: any) {
		logger?.error('Failed to process delete', {
			error: err.message,
			galleryId,
			filename,
			type,
			orderId
		});
		return { galleryId, success: false };
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

	for (let i = 0; i < deletes.length; i += BATCH_SIZE) {
		const batch = deletes.slice(i, i + BATCH_SIZE);
		const results = await Promise.allSettled(
			batch.map(deleteReq => processDelete(deleteReq, bucket, logger))
		);

		// Collect gallery IDs and track final image deletes
		results.forEach((result, index) => {
			if (result.status === 'fulfilled' && result.value?.success) {
				const deleteReq = batch[index];
				processedGalleries.add(result.value.galleryId);
				
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

	// Check directories for final image deletes and update order status if needed
	if (finalImageDeletes.size > 0) {
		const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
		const ordersTable = envProc?.env?.ORDERS_TABLE as string;
		
		if (galleriesTable && ordersTable) {
			// Process each unique galleryId/orderId combination
			for (const [key, deletes] of finalImageDeletes.entries()) {
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
						const key = obj.Key || '';
						// Only count files directly under the prefix, not subdirectories
						return key.startsWith(finalPrefix) && key !== finalPrefix && !key.substring(finalPrefix.length).includes('/');
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

	// Storage recalculation is now on-demand with caching (5-minute TTL)
	// No need to trigger recalculation here - it will happen automatically when:
	// 1. Critical operations (pay, validateUploadLimits) force recalculation
	// 2. Display operations use cached values (acceptable to be slightly stale after deletes)
	// Cache will naturally expire after 5 minutes, triggering recalculation on next read

	logger?.info('Batch delete processing completed', {
		totalDeletes: deletes.length,
		galleriesProcessed: processedGalleries.size,
		finalImageDirectoriesChecked: finalImageDeletes.size
	});
});

