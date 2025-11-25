import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

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

	const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
	const updates: any = {};
	const expressionAttributeValues: any = {};
	const updateExpressions: string[] = [];

	if (body.totalCents !== undefined) {
		updates.totalCents = parseInt(body.totalCents, 10);
		updateExpressions.push('totalCents = :tc');
		expressionAttributeValues[':tc'] = updates.totalCents;
	}

	if (updateExpressions.length === 0) {
		return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update' }) };
	}

	updateExpressions.push('updatedAt = :u');
	expressionAttributeValues[':u'] = new Date().toISOString();

	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId },
		UpdateExpression: `SET ${updateExpressions.join(', ')}`,
		ExpressionAttributeValues: expressionAttributeValues
	}));

	return { statusCode: 200, body: JSON.stringify({ galleryId, orderId, ...updates }) };
});

