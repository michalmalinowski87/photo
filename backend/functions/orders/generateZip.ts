import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { hasAddon, ADDON_TYPES } from '../../lib/src/addons';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	
	if (!galleriesTable || !ordersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	
	if (!galleryId || !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or orderId' })
		};
	}

	const requester = getUserIdFromEvent(event);
	if (!requester) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	// Verify gallery ownership
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
	requireOwnerOr403(gallery.ownerId, requester);

	// Get order
	const orderGet = await ddb.send(new GetCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId }
	}));
	const order = orderGet.Item as any;
	if (!order) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Order not found' })
		};
	}

	// Only allow if order status is CLIENT_APPROVED
	if (order.deliveryStatus !== 'CLIENT_APPROVED') {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'ZIP can only be generated for orders with CLIENT_APPROVED status',
				currentStatus: order.deliveryStatus
			})
		};
	}

	// Check if gallery has backup addon - if it does, ZIP should have been auto-generated
	const galleryHasBackup = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
	if (galleryHasBackup) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Gallery has backup storage addon. ZIP should have been auto-generated. Please use download endpoint.'
			})
		};
	}

	// Check if ZIP already exists
	if (order.zipKey) {
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				orderId,
				galleryId,
				zipKey: order.zipKey,
				message: 'ZIP already exists for this order'
			})
		};
	}

	// Generate ZIP using existing ZIP generation logic
	if (!zipFnName) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'ZIP generation service not configured' })
		};
	}

	if (!order.selectedKeys || !Array.isArray(order.selectedKeys) || order.selectedKeys.length === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Order has no selected keys to generate ZIP from' })
		};
	}

	try {
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
		
		if (!invokeResponse.Payload) {
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'ZIP generation returned no payload' })
			};
		}

		const payloadString = Buffer.from(invokeResponse.Payload).toString();
		let zipResult: any;
		try {
			zipResult = JSON.parse(payloadString);
		} catch (parseErr: any) {
			logger.error('Failed to parse ZIP generation response', {
				payloadString,
				error: parseErr.message
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'ZIP generation returned invalid JSON', 
					message: parseErr.message
				})
			};
		}

		// Check if Lambda invocation itself failed
		if (zipResult.errorMessage) {
			logger.error('ZIP generation Lambda invocation error', zipResult);
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'ZIP generation Lambda invocation failed', 
					lambdaError: zipResult.errorMessage
				})
			};
		}

		// When Lambda is invoked directly, it returns { statusCode, body } format
		if (zipResult.statusCode && zipResult.body) {
			try {
				const bodyParsed = typeof zipResult.body === 'string' ? JSON.parse(zipResult.body) : zipResult.body;
				if (zipResult.statusCode !== 200) {
					logger.error('ZIP generation Lambda returned error status', {
						statusCode: zipResult.statusCode,
						body: bodyParsed
					});
					return {
						statusCode: zipResult.statusCode,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ 
							error: 'ZIP generation failed', 
							lambdaError: bodyParsed.error || bodyParsed
						})
					};
				}
				zipResult = bodyParsed;
			} catch (bodyParseErr: any) {
				logger.error('Failed to parse Lambda response body', {
					error: bodyParseErr.message
				});
				return {
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'ZIP generation returned invalid body format', 
						message: bodyParseErr.message
					})
				};
			}
		}

		if (zipResult.zipKey) {
			// Update order with zipKey
			await ddb.send(new UpdateCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId },
				UpdateExpression: 'SET zipKey = :z',
				ExpressionAttributeValues: { ':z': zipResult.zipKey }
			}));
			
			logger.info('ZIP generated manually for order', { galleryId, orderId, zipKey: zipResult.zipKey });
			
			// Return JSON response only - client should call Download ZIP endpoint to get the file
			// This maintains clear separation of concerns: Generate creates, Download serves
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					orderId,
					galleryId,
					zipKey: zipResult.zipKey,
					message: 'ZIP generated successfully. Use download endpoint to download.'
				})
			};
		} else {
			logger.error('ZIP generation did not return zipKey', zipResult);
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'ZIP generation did not return zipKey',
					response: zipResult
				})
			};
		}
	} catch (err: any) {
		logger.error('Failed to generate ZIP', {
			error: err.message,
			galleryId,
			orderId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'ZIP generation failed', 
				message: err.message
			})
		};
	}
});

