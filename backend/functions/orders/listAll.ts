import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
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
	const itemsPerPageClamped = Math.min(Math.max(itemsPerPage, 1), 100);

	try {
		// Use DynamoDB pagination instead of fetching all orders
		// Fetch enough items to handle pagination, filtering, and sorting
		// We fetch more than one page since we need to filter/sort in memory
		const fetchLimit = itemsPerPageClamped * Math.max(pageClamped, 10); // Fetch up to 10 pages worth, or enough for current page
		const maxFetchLimit = 500; // Hard limit to prevent excessive data fetching
		const effectiveFetchLimit = Math.min(fetchLimit, maxFetchLimit);
		
		// Parse lastKey for pagination if provided
		const lastKeyParam = event?.queryStringParameters?.lastKey;
		let exclusiveStartKey: Record<string, any> | undefined;
		if (lastKeyParam) {
			try {
				exclusiveStartKey = JSON.parse(decodeURIComponent(lastKeyParam));
			} catch {
				// Invalid lastKey, ignore it
			}
		}

		// Query orders for this owner using the GSI with pagination
		let allOrders: any[] = [];
		let lastEvaluatedKey: Record<string, any> | undefined;
		
		try {
			const queryParams: any = {
				TableName: ordersTable,
				IndexName: 'ownerId-deliveryStatus-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				},
				Limit: effectiveFetchLimit,
				ScanIndexForward: false, // Sort descending by sort key (newest first)
			};
			
			if (deliveryStatus) {
				// Use GSI key condition for exact match
				queryParams.KeyConditionExpression = 'ownerId = :o AND deliveryStatus = :ds';
				queryParams.ExpressionAttributeValues[':ds'] = deliveryStatus;
			}
			
			if (exclusiveStartKey) {
				queryParams.ExclusiveStartKey = exclusiveStartKey;
			}

			const ordersQuery = await ddb.send(new QueryCommand(queryParams));
			allOrders = ordersQuery.Items || [];
			lastEvaluatedKey = ordersQuery.LastEvaluatedKey;
		} catch (gsiError: any) {
			// Fallback: If GSI query fails, use gallery-based queries with pagination
			const logger = (context as any).logger;
			logger?.warn('GSI query failed, falling back to gallery-based queries', {
				ownerId,
				errorName: gsiError.name,
				errorMessage: gsiError.message
			});
			
			const galleriesQuery = await ddb.send(new QueryCommand({
				TableName: galleriesTable,
				IndexName: 'ownerId-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				},
				Limit: 100 // Limit galleries fetched
			}));

			const galleries = galleriesQuery.Items || [];
			
			if (galleries.length > 0) {
				// Fetch orders for each gallery with limits
				const orderPromises = galleries.slice(0, 50).map((gallery: any) =>
					ddb.send(new QueryCommand({
						TableName: ordersTable,
						KeyConditionExpression: 'galleryId = :g',
						ExpressionAttributeValues: {
							':g': gallery.galleryId
						},
						Limit: Math.ceil(effectiveFetchLimit / galleries.length),
						ScanIndexForward: false
					}))
				);

				const orderResults = await Promise.all(orderPromises);
				orderResults.forEach((result) => {
					allOrders.push(...(result.Items || []));
				});
				
				// Sort and limit
				allOrders.sort((a, b) => {
					const dateA = new Date(a.createdAt || 0).getTime();
					const dateB = new Date(b.createdAt || 0).getTime();
					return dateB - dateA;
				});
				allOrders = allOrders.slice(0, effectiveFetchLimit);
			}
		}

		// Get unique gallery IDs from fetched orders
		const galleryIds = [...new Set(allOrders.map((o: any) => o.galleryId).filter(Boolean))];
		
		// Use BatchGetItem for specific galleries (more efficient than querying all)
		const galleryMap = new Map();
		if (galleryIds.length > 0) {
			// BatchGetItem can fetch up to 100 items
			const batchSize = 100;
			for (let i = 0; i < galleryIds.length; i += batchSize) {
				const batch = galleryIds.slice(i, i + batchSize);
				const keys = batch.map(galleryId => ({ galleryId }));
				
				try {
					const batchResult = await ddb.send(new BatchGetCommand({
						RequestItems: {
							[galleriesTable]: {
								Keys: keys
							}
						}
					}));
					
					const galleries = batchResult.Responses?.[galleriesTable] || [];
					galleries.forEach((g: any) => {
						galleryMap.set(g.galleryId, {
							galleryId: g.galleryId,
							galleryName: g.galleryName || g.galleryId,
							selectionEnabled: g.selectionEnabled !== false
						});
					});
				} catch (batchError) {
					const logger = (context as any).logger;
					logger?.warn('BatchGetItem failed, falling back to individual queries', {}, batchError);
					// Fallback: query all galleries if batch fails
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
					break; // Exit loop if fallback is used
				}
			}
		}

		// Apply filters and enrich orders with gallery info
		const filteredOrders: any[] = [];
		allOrders.forEach((order: any) => {
			// Apply deliveryStatus filters if provided (only needed if not using GSI key condition)
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
		
		// Sort by creation date (newest first) - needed if using fallback or excludeDeliveryStatus filter
		filteredOrders.sort((a, b) => {
			const dateA = new Date(a.createdAt || 0).getTime();
			const dateB = new Date(b.createdAt || 0).getTime();
			return dateB - dateA;
		});

		// Calculate pagination from filtered results
		const total = filteredOrders.length;
		const totalPages = Math.ceil(total / itemsPerPageClamped);
		const startIndex = (pageClamped - 1) * itemsPerPageClamped;
		const endIndex = startIndex + itemsPerPageClamped;
		
		// Apply pagination
		const paginatedOrders = filteredOrders.slice(startIndex, endIndex);
		
		// Determine if there are more pages
		// If we hit the fetch limit, there might be more data
		const hasMore = lastEvaluatedKey !== undefined || filteredOrders.length >= effectiveFetchLimit;

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
				hasNextPage: hasMore || pageClamped < totalPages,
				hasPreviousPage: pageClamped > 1,
				lastKey: lastEvaluatedKey ? encodeURIComponent(JSON.stringify(lastEvaluatedKey)) : undefined
			})
		};
	} catch (error: any) {
		const { sanitizeErrorMessage } = require('../../lib/src/error-utils');
		const safeMessage = sanitizeErrorMessage(error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to list orders', 
				message: safeMessage
			})
		};
	}
});

