import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { queryOrdersByOwnerWithFallback } from '../../lib/src/dynamodb-utils';
import { sanitizeErrorMessage } from '../../lib/src/error-utils';
import * as crypto from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
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
		// Query CHANGES_REQUESTED and CLIENT_APPROVED orders using parallel GSI queries
		const queryStartTime = Date.now();
		
		// Query both statuses in parallel for efficiency
		const [changesRequestedResult, clientApprovedResult] = await Promise.all([
			queryOrdersByOwnerWithFallback(
				ddb,
				ownerId,
				ordersTable,
				galleriesTable,
				{
					deliveryStatus: 'CHANGES_REQUESTED'
				}
			),
			queryOrdersByOwnerWithFallback(
				ddb,
				ownerId,
				ordersTable,
				galleriesTable,
				{
					deliveryStatus: 'CLIENT_APPROVED'
				}
			)
		]);
		
		// Combine results from both queries
		const allOrders = [
			...(changesRequestedResult.orders || []),
			...(clientApprovedResult.orders || [])
		];
		
		const queryDuration = Date.now() - queryStartTime;

		// Extract only status fields for efficient response
		const orders = allOrders.map((order: any) => ({
			orderId: order.orderId,
			galleryId: order.galleryId,
			deliveryStatus: order.deliveryStatus,
			paymentStatus: order.paymentStatus,
			amount: order.amount,
			state: order.state,
			updatedAt: order.updatedAt
		}));

		// Generate ETag from orders data (MD5 hash)
		const ordersJson = JSON.stringify(orders);
		const etag = crypto.createHash('md5').update(ordersJson).digest('hex');

		// Check If-None-Match header for 304 Not Modified
		const ifNoneMatch = event.headers?.['if-none-match'] || event.headers?.['If-None-Match'];
		if (ifNoneMatch && ifNoneMatch === etag) {
			logger?.info('Order statuses request - 304 Not Modified', {
				ownerId,
				etag,
				orderCount: orders.length,
				queryDuration: `${queryDuration}ms`,
				ifNoneMatch
			});
			return {
				statusCode: 304,
				headers: {
					'ETag': etag,
					'Cache-Control': 'no-cache'
				}
			};
		}

		logger?.info('Order statuses request - 200 OK', {
			ownerId,
			etag,
			orderCount: orders.length,
			orderIds: orders.map((o: any) => o.orderId),
			queryDuration: `${queryDuration}ms`,
			ifNoneMatch: ifNoneMatch || 'none',
			etagMatch: ifNoneMatch === etag
		});

		// Return 200 with ETag and status data
		return {
			statusCode: 200,
			headers: {
				'content-type': 'application/json',
				'ETag': etag,
				'Cache-Control': 'no-cache'
			},
			body: JSON.stringify({
				orders,
				timestamp: new Date().toISOString()
			})
		};
	} catch (error: any) {
		logger?.error('Failed to get order statuses', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			ownerId
		});
		
		const safeMessage = sanitizeErrorMessage(error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to get order statuses', 
				message: safeMessage
			})
		};
	}
});

