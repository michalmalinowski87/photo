import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { hasAddon, createBackupStorageAddon, ADDON_TYPES } from '../../lib/src/addons';

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
	
	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId' })
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

	// Check if gallery already has backup addon
	const addonExists = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
	if (addonExists) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Backup storage addon already purchased for this gallery' })
		};
	}

	// Get all orders for the gallery to calculate total addon price
	// We'll use the average order value or a base price
	// For simplicity, we'll use a fixed price based on gallery pricing package
	// Or calculate based on all orders' total
	const ordersQuery = await ddb.send(new QueryCommand({
		TableName: ordersTable,
		KeyConditionExpression: 'galleryId = :g',
		ExpressionAttributeValues: { ':g': galleryId }
	}));
	const orders = ordersQuery.Items || [];
	
	// Calculate addon price based on average order value or use a base calculation
	// For now, we'll use the gallery's pricing package to estimate
	// The multiplier will be stored in the addon object and can be configured through UI in the future
	const BACKUP_STORAGE_MULTIPLIER = 0.3; // Default 30%, will be configurable through UI in future
	const pkg = gallery.pricingPackage as { includedCount?: number; extraPriceCents?: number } | undefined;
	const estimatedOrderValue = pkg?.extraPriceCents ? (pkg.extraPriceCents * 10) : 10000; // Default to 100 PLN if no package
	const backupStorageCents = Math.round(estimatedOrderValue * BACKUP_STORAGE_MULTIPLIER);

	// Create addon record (gallery-level)
	try {
		await createBackupStorageAddon(galleryId, backupStorageCents, BACKUP_STORAGE_MULTIPLIER);
		logger.info('Backup storage addon purchased for gallery', { galleryId, backupStorageCents, multiplier: BACKUP_STORAGE_MULTIPLIER });
	} catch (err: any) {
		logger.error('Failed to create backup storage addon', {
			error: err.message,
			galleryId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to create addon', message: err.message })
		};
	}

	// Generate ZIPs for all orders in the gallery that don't have ZIPs yet
	const generatedZips: string[] = [];
	if (zipFnName) {
		for (const order of orders) {
			if (!order.zipKey && order.selectedKeys && Array.isArray(order.selectedKeys) && order.selectedKeys.length > 0) {
				try {
					const orderId = order.orderId;
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
								orderId
							});
							continue;
						}

						// Handle Lambda response format
						if (zipResult.statusCode && zipResult.body) {
							try {
								const bodyParsed = typeof zipResult.body === 'string' ? JSON.parse(zipResult.body) : zipResult.body;
								if (zipResult.statusCode === 200) {
									zipResult = bodyParsed;
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
							logger.info('ZIP generated after addon purchase', { galleryId, orderId, zipKey: zipResult.zipKey });
						}
					}
				} catch (err: any) {
					// Log but continue - ZIP generation can be retried later
					logger.warn('ZIP generation failed after addon purchase', { 
						error: err.message, 
						galleryId, 
						orderId: order.orderId 
					});
				}
			}
		}
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			galleryId,
			backupStorageCents,
			generatedZipsCount: generatedZips.length,
			generatedZips,
			message: 'Backup storage addon purchased successfully for gallery. ZIPs generated for existing orders.'
		})
	};
});

