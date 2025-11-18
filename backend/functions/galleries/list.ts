import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	if (!galleriesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing GALLERIES_TABLE' })
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

	try {
		// Query galleries by ownerId using GSI
		const galleriesQuery = await ddb.send(new QueryCommand({
			TableName: galleriesTable,
			IndexName: 'ownerId-index',
			KeyConditionExpression: 'ownerId = :o',
			ExpressionAttributeValues: { ':o': requester },
			ScanIndexForward: false // newest first
		}));

		const galleries = (galleriesQuery.Items || []).map((g: any) => ({
			galleryId: g.galleryId,
			galleryName: g.galleryName,
			ownerId: g.ownerId,
			state: g.state,
			selectionEnabled: g.selectionEnabled,
			selectionStatus: g.selectionStatus,
			// Removed selectionLocked and changeRequestPending - these are derived from orders below
			pricingPackage: g.pricingPackage,
			selectionStats: g.selectionStats,
			currentOrderId: g.currentOrderId,
			lastOrderNumber: g.lastOrderNumber,
			clientEmail: g.clientEmail, // Include clientEmail for "Send to Client" button visibility
			plan: g.plan,
			priceCents: g.priceCents,
			storageLimitBytes: g.storageLimitBytes,
			bytesUsed: g.bytesUsed || 0,
			expiresAt: g.expiresAt,
			createdAt: g.createdAt,
			updatedAt: g.updatedAt
		}));

		// Optionally enrich with order summaries (can be done in parallel)
		const enrichedGalleries = await Promise.all(galleries.map(async (g: any) => {
			if (ordersTable && g.galleryId) {
				try {
					const ordersQuery = await ddb.send(new QueryCommand({
						TableName: ordersTable,
						KeyConditionExpression: 'galleryId = :g',
						ExpressionAttributeValues: { ':g': g.galleryId }
					}));
					const orders = ordersQuery.Items || [];
					// Derive changeRequestPending from CHANGES_REQUESTED order status (not from gallery flag)
					const changeRequestPending = orders.some((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
					return {
						...g,
						changeRequestPending, // Derived from order status, not gallery flag
						orderCount: orders.length,
						totalRevenueCents: orders.reduce((sum: number, o: any) => sum + (o.totalCents || 0), 0),
						latestOrder: orders.length > 0 ? orders.sort((a: any, b: any) => 
							new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
						)[0] : null
					};
				} catch (err) {
					// If orders query fails, continue without order data
					return { ...g, changeRequestPending: false, orderCount: 0, totalRevenueCents: 0 };
				}
			}
			return { ...g, changeRequestPending: false, orderCount: 0, totalRevenueCents: 0 };
		}));

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ items: enrichedGalleries })
		};
	} catch (error: any) {
		console.error('List galleries failed:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list galleries', message: error.message })
	};
	}
});

