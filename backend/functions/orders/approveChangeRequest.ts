import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	if (!galleriesTable || !ordersTable || !bucket) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId) return { statusCode: 400, body: 'missing id' };
	const requester = getUserIdFromEvent(event);

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	requireOwnerOr403(gallery.ownerId, requester);
	
	// Find the CHANGES_REQUESTED order
	let targetOrderId = orderId;
	let order: any;
	
	if (targetOrderId) {
		// If orderId provided, fetch directly
		const orderGet = await ddb.send(new GetCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId: targetOrderId }
		}));
		order = orderGet.Item;
		if (!order) return { statusCode: 404, body: 'order not found' };
		if (order.deliveryStatus !== 'CHANGES_REQUESTED') {
			return { statusCode: 400, body: `order must have deliveryStatus CHANGES_REQUESTED, got ${order.deliveryStatus}` };
		}
	} else {
		// Auto-find the CHANGES_REQUESTED order
		const ordersQuery = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: { ':g': galleryId }
		}));
		const orders = ordersQuery.Items || [];
		order = orders.find((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
		if (!order) {
			return { statusCode: 400, body: 'no CHANGES_REQUESTED order found for this gallery' };
		}
		targetOrderId = order.orderId;
	}

	// Change the order to CLIENT_SELECTING status (preserves all order data)
	const now = new Date().toISOString();
	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId: targetOrderId },
		UpdateExpression: 'SET deliveryStatus = :ds, updatedAt = :u REMOVE canceledAt',
		ExpressionAttributeValues: { 
			':ds': 'CLIENT_SELECTING',
			':u': now
		}
	}));

	// Unlock selection (no need to clear changeRequestPending flag - it's derived from order status)
	// Selection state is now stored in orders, not a separate selections table
	await ddb.send(new UpdateCommand({
		TableName: galleriesTable,
		Key: { galleryId },
		UpdateExpression: 'SET selectionStatus = :s, currentOrderId = :oid, updatedAt = :u',
		ExpressionAttributeValues: {
			':s': 'IN_PROGRESS',
			':oid': targetOrderId,
			':u': now
		}
	}));

	return { statusCode: 200, body: JSON.stringify({ galleryId, orderId: targetOrderId, unlocked: true }) };
});

