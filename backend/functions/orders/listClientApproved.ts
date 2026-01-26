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
	const access = await verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner && !access.isClient) {
		return { 
			statusCode: 401, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	// Query for CLIENT_APPROVED, PREPARING_DELIVERY, and CHANGES_REQUESTED orders (buy-more orders that are approved but not yet delivered)
	// These statuses represent orders that are approved but not yet delivered to the client
	// Try using GSI first, fall back to query + filter if GSI not available yet
	let orders: any[] = [];
	try {
		// Query CLIENT_APPROVED, PREPARING_DELIVERY, and CHANGES_REQUESTED in parallel using GSI
		const [clientApprovedQuery, preparingDeliveryQuery, changesRequestedQuery] = await Promise.all([
			ddb.send(new QueryCommand({
				TableName: ordersTable,
				IndexName: 'galleryId-deliveryStatus-index',
				KeyConditionExpression: 'galleryId = :g AND deliveryStatus = :ds1',
				ExpressionAttributeValues: {
					':g': galleryId,
					':ds1': 'CLIENT_APPROVED'
				}
			})),
			ddb.send(new QueryCommand({
				TableName: ordersTable,
				IndexName: 'galleryId-deliveryStatus-index',
				KeyConditionExpression: 'galleryId = :g AND deliveryStatus = :ds2',
				ExpressionAttributeValues: {
					':g': galleryId,
					':ds2': 'PREPARING_DELIVERY'
				}
			})),
			ddb.send(new QueryCommand({
				TableName: ordersTable,
				IndexName: 'galleryId-deliveryStatus-index',
				KeyConditionExpression: 'galleryId = :g AND deliveryStatus = :ds3',
				ExpressionAttributeValues: {
					':g': galleryId,
					':ds3': 'CHANGES_REQUESTED'
				}
			}))
		]);
		
		// Merge results from all three queries
		orders = [
			...(clientApprovedQuery.Items || []),
			...(preparingDeliveryQuery.Items || []),
			...(changesRequestedQuery.Items || [])
		];
	} catch (gsiError: any) {
		// Fallback: Query all orders for gallery and filter by status
		const logger = (_context as any).logger;
		logger?.warn('GSI not available, using fallback query', {
			galleryId: event?.pathParameters?.id,
			errorName: gsiError.name,
			errorMessage: gsiError.message
		});
		const allOrdersQuery = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: {
				':g': galleryId
			}
		}));
		
		orders = (allOrdersQuery.Items || []).filter((order: any) => 
			order.deliveryStatus === 'CLIENT_APPROVED' || 
			order.deliveryStatus === 'PREPARING_DELIVERY' || 
			order.deliveryStatus === 'CHANGES_REQUESTED'
		);
	}

	// Return order metadata with selectedKeys for "Dokupione" view
	const sortedOrders = orders
		.map((order: any) => ({
			orderId: order.orderId,
			orderNumber: order.orderNumber,
			selectedKeys: order.selectedKeys || [],
			selectedCount: order.selectedCount || 0,
			createdAt: order.createdAt
		}))
		.sort((a: any, b: any) => {
			// Sort by createdAt descending (newest first)
			const dateA = new Date(a.createdAt || 0).getTime();
			const dateB = new Date(b.createdAt || 0).getTime();
			return dateB - dateA;
		});

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ items: sortedOrders })
	};
});
