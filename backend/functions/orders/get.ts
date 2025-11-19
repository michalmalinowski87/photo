import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { hasAddon, ADDON_TYPES } from '../../lib/src/addons';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	if (!galleriesTable || !ordersTable) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) return { statusCode: 400, body: 'missing params' };
	const requester = getUserIdFromEvent(event);

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	requireOwnerOr403(gallery.ownerId, requester);

	const o = await ddb.send(new GetCommand({ TableName: ordersTable, Key: { galleryId, orderId } }));
	if (!o.Item) return { statusCode: 404, body: 'order not found' };

	const order = o.Item as any;
	
	// Check if gallery has backup storage addon (gallery-level)
	const hasBackupStorage = await hasAddon(galleryId, ADDON_TYPES.BACKUP_STORAGE);
	
	// Include addon info in response
	const orderWithAddon = {
		...order,
		hasBackupStorage
	};

	return { statusCode: 200, body: JSON.stringify(orderWithAddon) };
});


