import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Lightweight endpoint to fetch only order status fields
 * Used to refresh order status after uploads/deletes without fetching full order data
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any)?.logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	
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

	// Check authentication first - return 401 if no valid token
	if (!requester) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	// Verify gallery exists and user has access
	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}
	requireOwnerOr403(gallery.ownerId, requester);

	// Fetch order
	const o = await ddb.send(new GetCommand({ TableName: ordersTable, Key: { galleryId, orderId } }));
	if (!o.Item) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Order not found' })
		};
	}

	const order = o.Item as any;
	
	// Return only status-related fields needed for UI
	const statusResponse = {
		orderId: order.orderId,
		galleryId: order.galleryId,
		deliveryStatus: order.deliveryStatus,
		paymentStatus: order.paymentStatus,
		amount: order.amount,
		// Include any other fields needed for order actions in the sidebar
		state: order.state,
		createdAt: order.createdAt,
		updatedAt: order.updatedAt,
	};

	logger?.info('Order status fetched', {
		orderId,
		galleryId,
		deliveryStatus: order.deliveryStatus,
		paymentStatus: order.paymentStatus,
	});

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(statusResponse)
	};
});

