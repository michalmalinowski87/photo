import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { hasAddon, ADDON_TYPES } from '../../lib/src/addons';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any)?.logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	if (!galleriesTable || !ordersTable) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) return { statusCode: 400, body: 'missing params' };
	const requester = getUserIdFromEvent(event);

	// Check authentication first - return 401 if no valid token
	if (!requester) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	requireOwnerOr403(gallery.ownerId, requester);

	const o = await ddb.send(new GetCommand({ TableName: ordersTable, Key: { galleryId, orderId } }));
	if (!o.Item) return { statusCode: 404, body: 'order not found' };

	const order = o.Item as any;
	
	// Log order data for debugging (can be removed in production)
	if (logger) {
		logger.info('Order fetched', {
			orderId,
			galleryId,
			hasSelectedKeys: !!order.selectedKeys,
			selectedKeysType: typeof order.selectedKeys,
			selectedKeysIsArray: Array.isArray(order.selectedKeys),
			selectedKeysLength: Array.isArray(order.selectedKeys) ? order.selectedKeys.length : 'N/A',
			orderKeys: Object.keys(order)
		});
	}
	
	// Check if gallery has backup storage addon (gallery-level)
	const hasBackupStorage = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
	
	// Ensure selectedKeys is included in response (handle DynamoDB List type conversion)
	// DynamoDB might return List type which needs to be explicitly included
	const orderWithAddon = {
		...order,
		selectedKeys: order.selectedKeys || [], // Ensure selectedKeys is always present, even if empty
		hasBackupStorage
	};

	return { 
		statusCode: 200, 
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(orderWithAddon) 
	};
});


