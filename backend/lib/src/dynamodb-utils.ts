import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Query orders by ownerId using GSI with fallback to gallery-based queries
 * This utility handles the common pattern of querying orders via GSI and falling back
 * to gallery-based queries if the GSI is not available or query fails
 * 
 * @param ddb - DynamoDB Document Client
 * @param ownerId - The owner/user ID to query orders for
 * @param ordersTable - Name of the orders table
 * @param galleriesTable - Name of the galleries table
 * @param options - Additional query options
 * @returns Array of orders and optional lastEvaluatedKey for pagination
 */
export async function queryOrdersByOwnerWithFallback(
	ddb: DynamoDBDocumentClient,
	ownerId: string,
	ordersTable: string,
	galleriesTable: string,
	options?: {
		deliveryStatus?: string;
		limit?: number;
		exclusiveStartKey?: Record<string, any>;
		scanIndexForward?: boolean;
	}
): Promise<{
	orders: any[];
	lastEvaluatedKey?: Record<string, any>;
}> {
	const { deliveryStatus, limit, exclusiveStartKey, scanIndexForward = false } = options || {};

	try {
		// Try to use GSI for efficient querying
		const queryParams: any = {
			TableName: ordersTable,
			IndexName: 'ownerId-deliveryStatus-index',
			KeyConditionExpression: deliveryStatus 
				? 'ownerId = :o AND deliveryStatus = :ds'
				: 'ownerId = :o',
			ExpressionAttributeValues: deliveryStatus
				? { ':o': ownerId, ':ds': deliveryStatus }
				: { ':o': ownerId },
			ScanIndexForward: scanIndexForward
		};

		if (limit) {
			queryParams.Limit = limit;
		}

		if (exclusiveStartKey) {
			queryParams.ExclusiveStartKey = exclusiveStartKey;
		}

		const ordersQuery = await ddb.send(new QueryCommand(queryParams));
		return {
			orders: ordersQuery.Items || [],
			lastEvaluatedKey: ordersQuery.LastEvaluatedKey
		};
	} catch (gsiError: any) {
		// Fallback: If GSI query fails (e.g., index not ready or orders missing ownerId),
		// use the old method of querying by galleries
		// Note: This is a library function, logger would need to be passed in
		// For now, we'll use console.warn but it should be replaced when logger is available
		console.warn('GSI query failed, falling back to gallery-based queries:', gsiError.message);

		// Query galleries for this owner
		const galleriesQuery = await ddb.send(new QueryCommand({
			TableName: galleriesTable,
			IndexName: 'ownerId-index',
			KeyConditionExpression: 'ownerId = :o',
			ExpressionAttributeValues: {
				':o': ownerId
			},
			Limit: limit || 100 // Limit galleries to prevent excessive queries
		}));

		const galleries = galleriesQuery.Items || [];
		const allOrders: any[] = [];

		if (galleries.length > 0) {
			// Fetch orders for each gallery
			// Limit concurrent queries to prevent timeout
			const batchSize = 20;
			for (let i = 0; i < galleries.length; i += batchSize) {
				const batch = galleries.slice(i, i + batchSize);
				const orderPromises = batch.map((gallery: any) =>
					ddb.send(new QueryCommand({
						TableName: ordersTable,
						KeyConditionExpression: 'galleryId = :g',
						ExpressionAttributeValues: {
							':g': gallery.galleryId
						},
						Limit: limit ? Math.ceil(limit / galleries.length) : undefined,
						ScanIndexForward: scanIndexForward
					}))
				);

				const orderResults = await Promise.all(orderPromises);
				orderResults.forEach((result) => {
					allOrders.push(...(result.Items || []));
				});

				// If we have a limit and have fetched enough, stop
				if (limit && allOrders.length >= limit) {
					break;
				}
			}

			// Apply deliveryStatus filter if provided (only needed in fallback since GSI handles it)
			let filteredOrders = allOrders;
			if (deliveryStatus) {
				filteredOrders = allOrders.filter((o: any) => o.deliveryStatus === deliveryStatus);
			}

			// Sort by creation date if needed (GSI handles sorting via ScanIndexForward)
			if (!scanIndexForward) {
				filteredOrders.sort((a, b) => {
					const dateA = new Date(a.createdAt || 0).getTime();
					const dateB = new Date(b.createdAt || 0).getTime();
					return dateB - dateA;
				});
			}

			// Apply limit if specified
			const limitedOrders = limit ? filteredOrders.slice(0, limit) : filteredOrders;

			return {
				orders: limitedOrders,
				// No lastEvaluatedKey in fallback mode (we've already fetched what we need)
			};
		}

		return {
			orders: [],
		};
	}
}

