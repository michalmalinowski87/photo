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
	const deliveryStatus = event?.queryStringParameters?.deliveryStatus; // Optional filter (exact match)
	const excludeDeliveryStatus = event?.queryStringParameters?.excludeDeliveryStatus; // Optional filter (exclude status)
	const page = parseInt(event?.queryStringParameters?.page || '1', 10);
	const itemsPerPage = parseInt(event?.queryStringParameters?.itemsPerPage || event?.queryStringParameters?.limit || '1000', 10);
	
	// Validate and clamp pagination parameters
	const pageClamped = Math.max(1, page);
	const itemsPerPageClamped = Math.min(Math.max(itemsPerPage, 1), 1000);

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
				// Apply deliveryStatus filters if provided
				let includeOrder = true;
				
				if (deliveryStatus && order.deliveryStatus !== deliveryStatus) {
					includeOrder = false;
				}
				
				if (excludeDeliveryStatus && order.deliveryStatus === excludeDeliveryStatus) {
					includeOrder = false;
				}
				
				if (includeOrder) {
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

		// Calculate pagination
		const total = allOrders.length;
		const totalPages = Math.ceil(total / itemsPerPageClamped);
		const startIndex = (pageClamped - 1) * itemsPerPageClamped;
		const endIndex = startIndex + itemsPerPageClamped;
		
		// Apply pagination
		const paginatedOrders = allOrders.slice(startIndex, endIndex);

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				items: paginatedOrders,
				count: paginatedOrders.length,
				total: total,
				page: pageClamped,
				itemsPerPage: itemsPerPageClamped,
				totalPages: totalPages,
				hasNextPage: pageClamped < totalPages,
				hasPreviousPage: pageClamped > 1
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

