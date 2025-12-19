import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, DeleteCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

/**
 * Cleanup function to delete originals and finals after order is DELIVERED
 * Keeps only previews and thumbs for display purposes
 * 
 * IMPORTANT: This function deletes S3 objects ONLY - DynamoDB metadata is preserved!
 * This allows images to still be displayed using previews/thumbs even after originals are deleted.
 * 
 * This function:
 * 1. Deletes selected originals from S3 (galleries/{galleryId}/originals/)
 * 2. Deletes finals originals from S3 (galleries/{galleryId}/final/{orderId}/)
 * 3. Keeps previews and thumbs in all locations
 * 4. Keeps DynamoDB image metadata (NOT deleted - allows display after S3 deletion)
 * 5. Updates DynamoDB order to mark cleanup completed
 * 
 * Safety: Verifies order is DELIVERED before cleanup
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	
	if (!bucket || !galleriesTable || !imagesTable || !ordersTable) {
		logger.error('Missing required environment variables', { 
			bucket: !!bucket, 
			galleriesTable: !!galleriesTable,
			imagesTable: !!imagesTable,
			ordersTable: !!ordersTable 
		});
		return { statusCode: 500, body: JSON.stringify({ error: 'Missing required environment variables' }) };
	}

	// Parse event - can come from Lambda invocation or SQS
	let galleryId: string | undefined;
	let orderId: string | undefined;
	
	if (event.Records && Array.isArray(event.Records)) {
		// SQS event
		const record = event.Records[0];
		const body = JSON.parse(record.body);
		galleryId = body.galleryId;
		orderId = body.orderId;
	} else {
		// Direct invocation
		galleryId = event.galleryId || event.pathParameters?.id;
		orderId = event.orderId || event.pathParameters?.orderId;
	}

	if (!galleryId || !orderId) {
		logger.error('Missing galleryId or orderId', { galleryId, orderId, eventKeys: Object.keys(event) });
		return { statusCode: 400, body: JSON.stringify({ error: 'Missing galleryId or orderId' }) };
	}

	try {
		// Verify order exists and is DELIVERED (safety check)
		const orderGet = await ddb.send(new GetCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId }
		}));
		const order = orderGet.Item as any;
		
		if (!order) {
			logger.error('Order not found', { galleryId, orderId });
			return { statusCode: 404, body: JSON.stringify({ error: 'Order not found' }) };
		}
		
		if (order.deliveryStatus !== 'DELIVERED') {
			logger.warn('Order is not DELIVERED, skipping cleanup', { 
				galleryId, 
				orderId, 
				deliveryStatus: order.deliveryStatus 
			});
			return { 
				statusCode: 200, 
				body: JSON.stringify({ 
					message: 'Order is not DELIVERED, skipping cleanup',
					galleryId,
					orderId,
					deliveryStatus: order.deliveryStatus
				}) 
			};
		}

		// Check if cleanup already completed
		if (order.cleanupCompleted) {
			logger.info('Cleanup already completed for this order', { galleryId, orderId });
			return {
				statusCode: 200,
				body: JSON.stringify({
					galleryId,
					orderId,
					message: 'Cleanup already completed',
					cleanupCompleted: true
				})
			};
		}

		let deletedOriginalsCount = 0;
		let deletedFinalsCount = 0;
		const errors: string[] = [];

		// 1. Delete selected originals from S3 ONLY (keep DynamoDB metadata for display)
		// IMPORTANT: We do NOT delete DynamoDB records - metadata must be preserved
		// so images can still be displayed using previews/thumbs after originals are deleted
		if (order.selectedKeys && Array.isArray(order.selectedKeys) && order.selectedKeys.length > 0) {
			try {
				const selectedKeys = order.selectedKeys;
				
				// Delete from S3 only (DynamoDB metadata is preserved)
				const originalsPrefix = `galleries/${galleryId}/originals/`;
				const objectsToDelete = selectedKeys.map(key => ({
					Key: `${originalsPrefix}${key}`
				}));
				
				// Delete in batches (S3 DeleteObjects supports up to 1000 objects)
				const BATCH_SIZE = 1000;
				for (let i = 0; i < objectsToDelete.length; i += BATCH_SIZE) {
					const batch = objectsToDelete.slice(i, i + BATCH_SIZE);
					
					try {
						const deleteResponse = await s3.send(new DeleteObjectsCommand({
							Bucket: bucket,
							Delete: {
								Objects: batch,
								Quiet: true
							}
						}));
						
						deletedOriginalsCount += deleteResponse.Deleted?.length || 0;
						
						if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
							deleteResponse.Errors.forEach(err => {
								errors.push(`Failed to delete ${err.Key}: ${err.Code} - ${err.Message}`);
							});
						}
					} catch (batchErr: any) {
						errors.push(`Failed to delete originals S3 batch ${i}-${i + batch.length}: ${batchErr.message}`);
					}
				}
				
				logger.info('Deleted selected originals from S3 (DynamoDB metadata preserved)', { 
					galleryId, 
					orderId, 
					s3DeletedCount: deletedOriginalsCount,
					totalSelected: selectedKeys.length
				});
			} catch (originalsErr: any) {
				logger.error('Failed to delete selected originals', {
					error: originalsErr.message,
					galleryId,
					orderId
				});
				errors.push(`Failed to delete originals: ${originalsErr.message}`);
			}
		}

		// 2. Delete finals originals from S3 ONLY (keep DynamoDB metadata for display)
		// IMPORTANT: We do NOT delete DynamoDB records - metadata must be preserved
		// so images can still be displayed using previews/thumbs after originals are deleted
		try {
			// Query DynamoDB to get S3 keys for final images (but don't delete DynamoDB records)
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
					Limit: 1000
				};

				if (lastEvaluatedKey) {
					queryParams.ExclusiveStartKey = lastEvaluatedKey;
				}

				const queryResponse = await ddb.send(new QueryCommand(queryParams));
				allFinalImageRecords.push(...(queryResponse.Items || []));
				lastEvaluatedKey = queryResponse.LastEvaluatedKey;
			} while (lastEvaluatedKey);

			if (allFinalImageRecords.length > 0) {
				// Delete from S3 only (DynamoDB metadata is preserved)
				const finalsPrefix = `galleries/${galleryId}/final/${orderId}/`;
				const filesToDelete = allFinalImageRecords
					.map(record => ({
						Key: record.s3Key || `${finalsPrefix}${record.filename}`
					}))
					.filter(item => {
						const key = item.Key;
						// Keep previews, thumbs, bigthumbs subdirectories
						return !key.includes('/previews/') && 
							!key.includes('/thumbs/') && 
							!key.includes('/bigthumbs/') &&
							// Only delete files directly in final/{orderId}/, not subdirectories
							key.replace(finalsPrefix, '').indexOf('/') === -1;
					});

				// Delete in batches
				const BATCH_SIZE = 1000;
				for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
					const batch = filesToDelete.slice(i, i + BATCH_SIZE);
					
					try {
						const deleteResponse = await s3.send(new DeleteObjectsCommand({
							Bucket: bucket,
							Delete: {
								Objects: batch,
								Quiet: true
							}
						}));
						
						deletedFinalsCount += deleteResponse.Deleted?.length || 0;
						
						if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
							deleteResponse.Errors.forEach(err => {
								errors.push(`Failed to delete final ${err.Key}: ${err.Code} - ${err.Message}`);
							});
						}
					} catch (batchErr: any) {
						errors.push(`Failed to delete finals S3 batch ${i}-${i + batch.length}: ${batchErr.message}`);
					}
				}
				
				logger.info('Deleted finals originals from S3 (DynamoDB metadata preserved)', { 
					galleryId, 
					orderId, 
					s3DeletedCount: deletedFinalsCount,
					totalFiles: allFinalImageRecords.length
				});
			}
		} catch (finalsErr: any) {
			logger.error('Failed to delete finals originals', {
				error: finalsErr.message,
				galleryId,
				orderId
			});
			errors.push(`Failed to delete finals: ${finalsErr.message}`);
		}

		// 3. Mark cleanup as completed in DynamoDB
		try {
			await ddb.send(new UpdateCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId },
				UpdateExpression: 'SET cleanupCompleted = :c, cleanupCompletedAt = :t',
				ExpressionAttributeValues: {
					':c': true,
					':t': new Date().toISOString()
				}
			}));
			
			logger.info('Cleanup marked as completed', { galleryId, orderId });
		} catch (updateErr: any) {
			logger.error('Failed to mark cleanup as completed', {
				error: updateErr.message,
				galleryId,
				orderId
			});
			errors.push(`Failed to update DynamoDB: ${updateErr.message}`);
		}

		return {
			statusCode: 200,
			body: JSON.stringify({
				galleryId,
				orderId,
				message: 'Cleanup completed',
				deletedOriginalsCount,
				deletedFinalsCount,
				errors: errors.length > 0 ? errors : undefined,
				cleanupCompleted: true
			})
		};
	} catch (error: any) {
		logger.error('Failed to cleanup delivered order', {
			error: error.message,
			galleryId,
			orderId,
			stack: error.stack
		});
		return {
			statusCode: 500,
			body: JSON.stringify({ error: 'Failed to cleanup delivered order', message: error.message })
		};
	}
});

