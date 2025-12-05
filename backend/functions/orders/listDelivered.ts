import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, _context: any) => {
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	if (!galleriesTable || !ordersTable) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	if (!galleryId) return { statusCode: 400, body: 'missing id' };

	// Verify gallery exists
	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'gallery not found' };

	// Verify access - supports both owner (Cognito) and client (JWT) tokens
	const access = verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner && !access.isClient) {
		return { statusCode: 401, body: 'Unauthorized. Please log in.' };
	}

	// Query for DELIVERED or PREPARING_DELIVERY orders
	// Try using GSI first, fall back to query + filter if GSI not available yet
	let orders: any[] = [];
	try {
		// Try using galleryId-deliveryStatus-index GSI (if available)
		const ordersQuery1 = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			IndexName: 'galleryId-deliveryStatus-index',
			KeyConditionExpression: 'galleryId = :g AND deliveryStatus = :ds1',
			ExpressionAttributeValues: {
				':g': galleryId,
				':ds1': 'DELIVERED'
			}
		}));
		
		const ordersQuery2 = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			IndexName: 'galleryId-deliveryStatus-index',
			KeyConditionExpression: 'galleryId = :g AND deliveryStatus = :ds2',
			ExpressionAttributeValues: {
				':g': galleryId,
				':ds2': 'PREPARING_DELIVERY'
			}
		}));
		
		orders = [...(ordersQuery1.Items || []), ...(ordersQuery2.Items || [])];
	} catch (gsiError: any) {
		// Fallback: Query all orders for gallery and filter by status
		console.warn('GSI not available, using fallback query:', gsiError.message);
		const allOrdersQuery = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: {
				':g': galleryId
			}
		}));
		
		orders = (allOrdersQuery.Items || []).filter((order: any) => 
			order.deliveryStatus === 'DELIVERED' || order.deliveryStatus === 'PREPARING_DELIVERY'
		);
	}

	// Return order metadata only - images are fetched separately via /orders/{orderId}/final/images endpoint
	const sortedOrders = orders
		.map((order: any) => ({
			orderId: order.orderId,
			orderNumber: order.orderNumber,
			deliveredAt: order.deliveredAt || order.createdAt,
			selectedCount: order.selectedCount || 0,
			createdAt: order.createdAt
		}))
		.sort((a: any, b: any) => {
			// Sort by deliveredAt descending (newest first)
			const dateA = new Date(a.deliveredAt || a.createdAt || 0).getTime();
			const dateB = new Date(b.deliveredAt || b.createdAt || 0).getTime();
			return dateB - dateA;
		});

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ items: sortedOrders })
	};
});

