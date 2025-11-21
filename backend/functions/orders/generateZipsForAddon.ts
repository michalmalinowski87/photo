import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	
	if (!ordersTable || !zipFnName || !bucket) {
		logger.error('Missing required environment variables', { 
			hasOrdersTable: !!ordersTable, 
			hasZipFnName: !!zipFnName 
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	// Event can come from direct invoke or EventBridge
	const galleryId = event.galleryId || event.detail?.galleryId;
	
	if (!galleryId) {
		logger.error('Missing galleryId in event', { event });
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId' })
		};
	}

	logger.info('Generating ZIPs for addon purchase', { galleryId });

	try {
		// Get all orders for the gallery
		const ordersQuery = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: { ':g': galleryId }
		}));
		const orders = ordersQuery.Items || [];
		
		logger.info('Found orders for gallery', { galleryId, orderCount: orders.length });

		// Generate ZIPs for all orders that don't have ZIPs yet
		const generatedZips: string[] = [];
		const skippedOrders: string[] = [];
		
		for (const order of orders) {
			if (!order.zipKey) {
				try {
					const orderId = order.orderId;
					let keysToZip: string[] = [];
					
					// Determine which keys to include in ZIP
					if (order.selectedKeys && Array.isArray(order.selectedKeys) && order.selectedKeys.length > 0) {
						// Order has selectedKeys - use them
						keysToZip = order.selectedKeys;
					} else {
						// Empty selectedKeys means all photos - list all originals from S3
						logger.info('Order has empty selectedKeys, listing all originals from S3', { galleryId, orderId });
						const originalsPrefix = `galleries/${galleryId}/originals/`;
						const originalsListResponse = await s3.send(new ListObjectsV2Command({
							Bucket: bucket,
							Prefix: originalsPrefix
						}));
						keysToZip = (originalsListResponse.Contents || [])
							.map(obj => {
								const fullKey = obj.Key || '';
								return fullKey.replace(originalsPrefix, '');
							})
							.filter((key): key is string => Boolean(key));
					}
					
					if (keysToZip.length === 0) {
						logger.warn('No keys to generate ZIP for order', { galleryId, orderId });
						skippedOrders.push(orderId);
						continue;
					}
					
					// Check if original files exist before generating ZIP
					const existingKeys: string[] = [];
					for (const key of keysToZip) {
						const originalKey = `galleries/${galleryId}/originals/${key}`;
						try {
							await s3.send(new HeadObjectCommand({
								Bucket: bucket,
								Key: originalKey
							}));
							existingKeys.push(key);
						} catch (err: any) {
							if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
								logger.warn('Original file does not exist, skipping', { galleryId, orderId, key, originalKey });
							} else {
								logger.error('Error checking if original file exists', { 
									galleryId, 
									orderId, 
									key, 
									originalKey,
									error: err.message 
								});
							}
						}
					}
					
					if (existingKeys.length === 0) {
						logger.warn('No original files exist for order, skipping ZIP generation', { 
							galleryId, 
							orderId,
							requestedKeysCount: keysToZip.length
						});
						skippedOrders.push(orderId);
						continue;
					}
					
					if (existingKeys.length < keysToZip.length) {
						logger.warn('Some original files are missing for order', { 
							galleryId, 
							orderId,
							requestedKeysCount: keysToZip.length,
							existingKeysCount: existingKeys.length,
							missingCount: keysToZip.length - existingKeys.length
						});
					}
					
					logger.info('Generating ZIP for order', { 
						galleryId, 
						orderId, 
						keysCount: existingKeys.length,
						requestedKeysCount: keysToZip.length
					});
					
					const payload = Buffer.from(JSON.stringify({ 
						galleryId, 
						keys: existingKeys, 
						orderId 
					}));
					const invokeResponse = await lambda.send(new InvokeCommand({ 
						FunctionName: zipFnName, 
						Payload: payload, 
						InvocationType: 'RequestResponse'
					}));
					
					if (invokeResponse.Payload) {
						const payloadString = Buffer.from(invokeResponse.Payload).toString();
						let zipResult: any;
						try {
							zipResult = JSON.parse(payloadString);
						} catch (parseErr: any) {
							logger.warn('Failed to parse ZIP generation response', {
								error: parseErr.message,
								galleryId,
								orderId,
								payloadPreview: payloadString.substring(0, 200)
							});
							continue;
						}

						// Handle Lambda response format
						if (zipResult.statusCode && zipResult.body) {
							try {
								const bodyParsed = typeof zipResult.body === 'string' ? JSON.parse(zipResult.body) : zipResult.body;
								if (zipResult.statusCode === 200) {
									zipResult = bodyParsed;
								} else {
									logger.warn('ZIP generation returned error status', {
										statusCode: zipResult.statusCode,
										body: bodyParsed,
										galleryId,
										orderId
									});
									continue;
								}
							} catch (bodyParseErr: any) {
								logger.warn('Failed to parse Lambda response body', {
									error: bodyParseErr.message,
									galleryId,
									orderId
								});
								continue;
							}
						}

						if (zipResult && zipResult.zipKey) {
							// Update order with zipKey
							await ddb.send(new UpdateCommand({
								TableName: ordersTable,
								Key: { galleryId, orderId },
								UpdateExpression: 'SET zipKey = :z',
								ExpressionAttributeValues: { ':z': zipResult.zipKey }
							}));
							generatedZips.push(orderId);
							logger.info('ZIP generated successfully for order', { 
								galleryId, 
								orderId, 
								zipKey: zipResult.zipKey 
							});
						} else {
							logger.warn('ZIP generation did not return zipKey', {
								galleryId,
								orderId,
								zipResult
							});
						}
					} else {
						logger.warn('ZIP generation returned no payload', {
							galleryId,
							orderId
						});
					}
				} catch (err: any) {
					logger.error('ZIP generation failed for order', { 
						error: {
							name: err.name,
							message: err.message,
							stack: err.stack
						},
						galleryId, 
						orderId: order.orderId 
					});
					// Continue with other orders
				}
			}
		}

		logger.info('ZIP generation completed for addon purchase', { 
			galleryId, 
			generatedZipsCount: generatedZips.length,
			generatedZips,
			skippedOrdersCount: skippedOrders.length,
			skippedOrders
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				generatedZipsCount: generatedZips.length,
				generatedZips,
				skippedOrdersCount: skippedOrders.length,
				skippedOrders,
				message: `ZIPs generated for ${generatedZips.length} order(s)${skippedOrders.length > 0 ? `. ${skippedOrders.length} order(s) skipped (no original files available)` : ''}`
			})
		};
	} catch (error: any) {
		logger.error('Failed to generate ZIPs for addon purchase', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			galleryId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to generate ZIPs', 
				message: error.message 
			})
		};
	}
});

