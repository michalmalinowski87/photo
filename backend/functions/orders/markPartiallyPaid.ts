import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	
	if (!ordersTable || !galleriesTable) {
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

	// Don't allow marking cancelled or delivered orders
	if (order.deliveryStatus === 'CANCELLED') {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Cannot mark cancelled order as partially paid' })
		};
	}
	if (order.deliveryStatus === 'DELIVERED') {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Cannot mark delivered order as partially paid' })
		};
	}

	// Update order payment status to PARTIALLY_PAID
	const now = new Date().toISOString();
	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId },
		UpdateExpression: 'SET paymentStatus = :p, partiallyPaidAt = :t',
		ExpressionAttributeValues: { ':p': 'PARTIALLY_PAID', ':t': now }
	}));

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			orderId,
			galleryId,
			paymentStatus: 'PARTIALLY_PAID',
			partiallyPaidAt: now
		})
	};
});

