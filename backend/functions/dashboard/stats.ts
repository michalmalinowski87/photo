import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { queryOrdersByOwnerWithFallback } from '../../lib/src/dynamodb-utils';

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
		// Query orders with pagination to prevent timeout with large datasets
		// Use reasonable limit per page and aggregate results
		const maxOrdersToProcess = 10000; // Hard limit to prevent excessive processing
		const pageSize = 1000; // Items per query page
		let allOrders: any[] = [];
		
		// Use pagination to fetch orders in batches using the shared utility
		let lastEvaluatedKey: Record<string, any> | undefined;
		do {
			const result = await queryOrdersByOwnerWithFallback(
				ddb,
				ownerId,
				ordersTable,
				galleriesTable,
				{
					limit: pageSize,
					exclusiveStartKey: lastEvaluatedKey,
					scanIndexForward: false
				}
			);
			
			allOrders.push(...result.orders);
			lastEvaluatedKey = result.lastEvaluatedKey;
			
			// Stop if we hit the max limit or no more results
			if (allOrders.length >= maxOrdersToProcess || !lastEvaluatedKey) {
				break;
			}
		} while (lastEvaluatedKey);

		// Get galleries for this owner with pagination
		const galleries: any[] = [];
		let galleriesLastKey: Record<string, any> | undefined;
		do {
			const galleriesQuery = await ddb.send(new QueryCommand({
				TableName: galleriesTable,
				IndexName: 'ownerId-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				},
				Limit: 1000
			}));
			
			galleries.push(...(galleriesQuery.Items || []));
			galleriesLastKey = galleriesQuery.LastEvaluatedKey;
		} while (galleriesLastKey);

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
			} else if (order.deliveryStatus === 'PREPARING_DELIVERY') {
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
		const { sanitizeErrorMessage } = require('../../lib/src/error-utils');
		const safeMessage = sanitizeErrorMessage(error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to get dashboard stats', 
				message: safeMessage
			})
		};
	}
});

