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

	// Query parameters
	const deliveryStatus = event?.queryStringParameters?.deliveryStatus; // Optional filter
	const limit = parseInt(event?.queryStringParameters?.limit || '1000', 10);
	const limitClamped = Math.min(Math.max(limit, 1), 1000);

	try {
		// First, get all galleries for this owner
		const galleriesQuery = await ddb.send(new QueryCommand({
			TableName: galleriesTable,
			IndexName: 'ownerId-index',
			KeyConditionExpression: 'ownerId = :o',
			ExpressionAttributeValues: {
				':o': ownerId
			}
		}));

		const galleries = galleriesQuery.Items || [];
		const galleryMap = new Map();
		galleries.forEach((g: any) => {
			galleryMap.set(g.galleryId, {
				galleryId: g.galleryId,
				galleryName: g.galleryName || g.galleryId
			});
		});

		if (galleries.length === 0) {
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					items: [],
					count: 0
				})
			};
		}

		// Query orders for all galleries in parallel
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
		
		// Combine all orders and add gallery info
		const allOrders: any[] = [];
		orderResults.forEach((result, index) => {
			const gallery = galleries[index];
			const orders = result.Items || [];
			orders.forEach((order: any) => {
				// Apply deliveryStatus filter if provided
				if (!deliveryStatus || order.deliveryStatus === deliveryStatus) {
					allOrders.push({
						...order,
						galleryId: gallery.galleryId,
						galleryName: gallery.galleryName || gallery.galleryId
					});
				}
			});
		});

		// Sort by creation date (newest first)
		allOrders.sort((a, b) => {
			const dateA = new Date(a.createdAt || 0).getTime();
			const dateB = new Date(b.createdAt || 0).getTime();
			return dateB - dateA;
		});

		// Apply limit
		const limitedOrders = allOrders.slice(0, limitClamped);

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				items: limitedOrders,
				count: limitedOrders.length,
				total: allOrders.length
			})
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to list orders', 
				message: error.message 
			})
		};
	}
});

