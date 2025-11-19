import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	
	if (!ordersTable || !zipFnName) {
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
		for (const order of orders) {
			if (!order.zipKey && order.selectedKeys && Array.isArray(order.selectedKeys) && order.selectedKeys.length > 0) {
				try {
					const orderId = order.orderId;
					logger.info('Generating ZIP for order', { galleryId, orderId, selectedKeysCount: order.selectedKeys.length });
					
					const payload = Buffer.from(JSON.stringify({ 
						galleryId, 
						keys: order.selectedKeys, 
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
			generatedZips
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				generatedZipsCount: generatedZips.length,
				generatedZips,
				message: `ZIPs generated for ${generatedZips.length} order(s)`
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

