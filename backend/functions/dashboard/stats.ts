import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
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

	const ownerId = getUserIdFromEvent(event);
	if (!ownerId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	try {
		// Query all orders for this owner using the GSI (single query instead of N+1)
		// Note: If GSI is not yet populated (during migration), fall back to gallery-based queries
		let allOrders: any[] = [];
		
		try {
			const ordersQuery = await ddb.send(new QueryCommand({
				TableName: ordersTable,
				IndexName: 'ownerId-deliveryStatus-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				}
			}));
			allOrders = ordersQuery.Items || [];
		} catch (gsiError: any) {
			// Fallback: If GSI query fails (e.g., index not ready or orders missing ownerId),
			// use the old method of querying by galleries
			console.warn('GSI query failed, falling back to gallery-based queries:', gsiError.message);
			
			const galleriesQuery = await ddb.send(new QueryCommand({
				TableName: galleriesTable,
				IndexName: 'ownerId-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				}
			}));

			const galleries = galleriesQuery.Items || [];
			
			if (galleries.length > 0) {
				const orderPromises = galleries.map((gallery: any) =>
					ddb.send(new QueryCommand({
						TableName: ordersTable,
						KeyConditionExpression: 'galleryId = :g',
						ExpressionAttributeValues: {
							':g': gallery.galleryId
						}
					}))
				);

				const orderResults = await Promise.all(orderPromises);
				orderResults.forEach((result) => {
					allOrders.push(...(result.Items || []));
				});
			}
		}

		// Get all galleries for this owner (for revenue calculation from package prices)
		const galleriesQuery = await ddb.send(new QueryCommand({
			TableName: galleriesTable,
			IndexName: 'ownerId-index',
			KeyConditionExpression: 'ownerId = :o',
			ExpressionAttributeValues: {
				':o': ownerId
			}
		}));

		const galleries = galleriesQuery.Items || [];

		// Aggregate statistics from all orders
		let deliveredCount = 0;
		let clientSelectingCount = 0;
		let readyToShipCount = 0;
		let totalRevenueCents = 0;

		// Process all orders
		allOrders.forEach((order: any) => {
			// Count orders by delivery status
			if (order.deliveryStatus === 'DELIVERED') {
				deliveredCount++;
			} else if (order.deliveryStatus === 'CLIENT_SELECTING') {
				clientSelectingCount++;
			} else if (order.deliveryStatus === 'PREPARING_FOR_DELIVERY') {
				readyToShipCount++;
			}

			// Sum revenue from orders (additional photos)
			totalRevenueCents += typeof order.totalCents === 'number' ? order.totalCents : 0;
		});

		// Add photography package prices to total revenue
		galleries.forEach((gallery: any) => {
			if (
				gallery &&
				typeof gallery === 'object' &&
				gallery.pricingPackage &&
				typeof gallery.pricingPackage === 'object' &&
				typeof gallery.pricingPackage.packagePriceCents === 'number'
			) {
				totalRevenueCents += gallery.pricingPackage.packagePriceCents;
			}
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				deliveredOrders: deliveredCount,
				clientSelectingOrders: clientSelectingCount,
				readyToShipOrders: readyToShipCount,
				totalRevenue: totalRevenueCents
			})
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to get dashboard stats', 
				message: error.message 
			})
		};
	}
});

