import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	if (!galleriesTable || !ordersTable) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	if (!galleryId) return { statusCode: 400, body: 'missing id' };
	const body = event?.body ? JSON.parse(event.body) : {};
	const orderId: string | undefined = body?.orderId;
	if (!orderId) return { statusCode: 400, body: 'orderId required' };
	const requester = getUserIdFromEvent(event);

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	requireOwnerOr403(gallery.ownerId, requester);

	const o = await ddb.send(new GetCommand({ TableName: ordersTable, Key: { galleryId, orderId } }));
	const order = o.Item as any;
	if (!order) return { statusCode: 404, body: 'order not found' };

	// Mark order delivered
	const now = new Date().toISOString();
	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId },
		UpdateExpression: 'SET deliveryStatus = :d, deliveredAt = :t',
		ExpressionAttributeValues: { ':d': 'DELIVERED', ':t': now }
	}));

	return { statusCode: 200, body: JSON.stringify({ galleryId, orderId, deliveryStatus: 'DELIVERED', deliveredAt: now }) };
});


