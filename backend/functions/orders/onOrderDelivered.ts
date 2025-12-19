import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { createHash } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

/**
 * Triggered when order status changes to DELIVERED
 * Pre-generates finals ZIP and triggers cleanup of originals/finals
 * 
 * Can be triggered by:
 * - EventBridge rule watching DynamoDB stream for DELIVERED status
 * - SQS queue message
 * - Direct Lambda invocation
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	const cleanupFnName = envProc?.env?.CLEANUP_DELIVERED_ORDER_FN_NAME as string;
	
	if (!bucket || !ordersTable) {
		logger.error('Missing required environment variables', { bucket: !!bucket, ordersTable: !!ordersTable });
		return { statusCode: 500, body: JSON.stringify({ error: 'Missing required environment variables' }) };
	}

	// Parse event - can come from EventBridge, SQS, or direct invocation
	let galleryId: string | undefined;
	let orderId: string | undefined;
	
	if (event.Records && Array.isArray(event.Records)) {
		// SQS event
		const record = event.Records[0];
		const body = JSON.parse(record.body);
		galleryId = body.galleryId;
		orderId = body.orderId;
	} else if (event.detail) {
		// EventBridge event
		galleryId = event.detail.galleryId;
		orderId = event.detail.orderId;
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
		// Verify order exists and is DELIVERED
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
			logger.warn('Order is not DELIVERED, skipping', { 
				galleryId, 
				orderId, 
				deliveryStatus: order.deliveryStatus 
			});
			return { 
				statusCode: 200, 
				body: JSON.stringify({ 
					message: 'Order is not DELIVERED, skipping ZIP generation',
					galleryId,
					orderId,
					deliveryStatus: order.deliveryStatus
				}) 
			};
		}

		// Pre-generate finals ZIP
		if (zipFnName) {
			try {
				// Check if final images exist and get list for hash generation from DynamoDB
				const imagesTable = envProc?.env?.IMAGES_TABLE as string;
				if (imagesTable) {
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
						// Generate hash of final files with metadata to validate ZIP freshness
						const finalFilesWithMetadata = allFinalImageRecords
							.map(record => ({
								filename: record.filename,
								etag: record.etag || '',
								size: record.size || 0,
								lastModified: record.lastModified || 0
							}))
							.sort((a, b) => a.filename.localeCompare(b.filename));
					
						const finalFilesHash = createHash('sha256')
							.update(JSON.stringify(finalFilesWithMetadata))
							.digest('hex')
							.substring(0, 16);

						// Invoke ZIP generation Lambda asynchronously
						const payload = Buffer.from(JSON.stringify({ 
							galleryId, 
							orderId, 
							type: 'final',
							finalFilesHash // Pass hash to ZIP generation function
						}));
						
						await lambda.send(new InvokeCommand({ 
							FunctionName: zipFnName, 
							Payload: payload, 
							InvocationType: 'Event' // Async invocation
						}));
						
						logger.info('Finals ZIP generation Lambda invoked', { galleryId, orderId, zipFnName });
					
						// Mark order as generating with timestamp and store hash
						await ddb.send(new UpdateCommand({
							TableName: ordersTable,
							Key: { galleryId, orderId },
							UpdateExpression: 'SET finalZipGenerating = :g, finalZipGeneratingSince = :ts, finalZipFilesHash = :h',
							ExpressionAttributeValues: { 
								':g': true,
								':ts': Date.now(),
								':h': finalFilesHash
							}
						}));
						
						logger.info('Order marked as generating final ZIP', { galleryId, orderId });
					} else {
						logger.warn('No final images found for order, skipping ZIP generation', { galleryId, orderId });
						// Clear the flag if it was pre-set by sendFinalLink/complete but no final images exist
						try {
							await ddb.send(new UpdateCommand({
								TableName: ordersTable,
								Key: { galleryId, orderId },
								UpdateExpression: 'REMOVE finalZipGenerating, finalZipGeneratingSince'
							}));
							logger.info('Cleared finalZipGenerating flag (no final images found)', { galleryId, orderId });
						} catch (clearErr: any) {
							logger.warn('Failed to clear finalZipGenerating flag', {
								error: clearErr.message,
								galleryId,
								orderId
							});
						}
					}
				} else {
					logger.warn('IMAGES_TABLE not set, skipping ZIP generation', { galleryId, orderId });
				}
			} catch (zipErr: any) {
				// Log but don't fail - ZIP generation is best effort
				logger.error('Failed to start finals ZIP pre-generation', {
					error: zipErr.message,
					galleryId,
					orderId,
					zipFnName
				});
			}
		}

		// Trigger cleanup of originals/finals (async)
		if (cleanupFnName) {
			try {
				const cleanupPayload = Buffer.from(JSON.stringify({ 
					galleryId, 
					orderId
				}));
				
				await lambda.send(new InvokeCommand({ 
					FunctionName: cleanupFnName, 
					Payload: cleanupPayload, 
					InvocationType: 'Event' // Async invocation
				}));
				
				logger.info('Cleanup Lambda invoked', { galleryId, orderId, cleanupFnName });
			} catch (cleanupErr: any) {
				// Log but don't fail - cleanup is best effort
				logger.error('Failed to trigger cleanup', {
					error: cleanupErr.message,
					galleryId,
					orderId,
					cleanupFnName
				});
			}
		}

		return {
			statusCode: 200,
			body: JSON.stringify({
				galleryId,
				orderId,
				message: 'ZIP pre-generation and cleanup triggered',
				zipGenerationTriggered: !!zipFnName,
				cleanupTriggered: !!cleanupFnName
			})
		};
	} catch (error: any) {
		logger.error('Failed to process order delivery', {
			error: error.message,
			galleryId,
			orderId,
			stack: error.stack
		});
		return {
			statusCode: 500,
			body: JSON.stringify({ error: 'Failed to process order delivery', message: error.message })
		};
	}
});

