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
		// Query all orders for this owner using the GSI (single query instead of N+1)
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

		// Get unique gallery IDs from orders
		const galleryIds = [...new Set(allOrders.map((o: any) => o.galleryId).filter(Boolean))];
		
		// Get galleries for gallery info (galleryName, selectionEnabled)
		const galleryMap = new Map();
		if (galleryIds.length > 0) {
			// Query galleries by ownerId (more efficient than batch get for many galleries)
			const galleriesQuery = await ddb.send(new QueryCommand({
				TableName: galleriesTable,
				IndexName: 'ownerId-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				}
			}));

			const galleries = galleriesQuery.Items || [];
			galleries.forEach((g: any) => {
				if (galleryIds.includes(g.galleryId)) {
					galleryMap.set(g.galleryId, {
						galleryId: g.galleryId,
						galleryName: g.galleryName || g.galleryId,
						selectionEnabled: g.selectionEnabled !== false
					});
				}
			});
		}

		// Apply filters and enrich orders with gallery info
		const filteredOrders: any[] = [];
		allOrders.forEach((order: any) => {
			// Apply deliveryStatus filters if provided
			let includeOrder = true;
			
			if (deliveryStatus && order.deliveryStatus !== deliveryStatus) {
				includeOrder = false;
			}
			
			if (excludeDeliveryStatus && order.deliveryStatus === excludeDeliveryStatus) {
				includeOrder = false;
			}
			
			if (includeOrder) {
				const galleryInfo = galleryMap.get(order.galleryId) || {
					galleryId: order.galleryId,
					galleryName: order.galleryId,
					selectionEnabled: true
				};
				
				filteredOrders.push({
					...order,
					galleryId: galleryInfo.galleryId,
					galleryName: galleryInfo.galleryName,
					gallerySelectionEnabled: galleryInfo.selectionEnabled
				});
			}
		});
		
		// Use filtered orders for pagination
		allOrders = filteredOrders;

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

