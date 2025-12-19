import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { queryOrdersByOwnerWithFallback } from '../../lib/src/dynamodb-utils';
import { sanitizeErrorMessage } from '../../lib/src/error-utils';
import * as crypto from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	
	if (!galleriesTable || !ordersTable || !bucket) {
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
		// Query CHANGES_REQUESTED, CLIENT_APPROVED, PREPARING_DELIVERY, and DELIVERED orders using parallel GSI queries
		// PREPARING_DELIVERY orders are included because they may have ZIP generation in progress
		// (e.g., when change request is approved and client approves new selection while finals exist)
		// DELIVERED orders are included only if they have finalZipGenerating=true to track final ZIP generation progress
		// (final ZIP is generated when order status changes to DELIVERED)
		const queryStartTime = Date.now();
		
		// Query all four statuses in parallel for efficiency
		const [changesRequestedResult, clientApprovedResult, preparingDeliveryResult, deliveredResult] = await Promise.all([
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
			),
			queryOrdersByOwnerWithFallback(
				ddb,
				ownerId,
				ordersTable,
				galleriesTable,
				{
					deliveryStatus: 'PREPARING_DELIVERY'
				}
			),
			queryOrdersByOwnerWithFallback(
				ddb,
				ownerId,
				ordersTable,
				galleriesTable,
				{
					deliveryStatus: 'DELIVERED'
				}
			)
		]);
		
		// Filter CLIENT_APPROVED, PREPARING_DELIVERY, and CHANGES_REQUESTED orders to include those with zipGenerating=true OR zipSelectedKeysHash set
		// This ensures we track orders that are actively generating ZIPs OR have completed ZIPs
		// (zipSelectedKeysHash is set when ZIP generation starts, so if it exists, a ZIP was attempted)
		// CHANGES_REQUESTED orders can have ZIP activity if they were CLIENT_APPROVED before status change
		const allClientApprovedOrders = clientApprovedResult.orders || [];
		const allPreparingDeliveryOrders = preparingDeliveryResult.orders || [];
		const allChangesRequestedOrders = changesRequestedResult.orders || [];
		
		const clientApprovedOrdersWithZipActivity = allClientApprovedOrders.filter(
			(order: any) => order.zipGenerating === true || order.zipSelectedKeysHash
		);
		const preparingDeliveryOrdersWithZipActivity = allPreparingDeliveryOrders.filter(
			(order: any) => order.zipGenerating === true || order.zipSelectedKeysHash
		);
		const changesRequestedOrdersWithZipActivity = allChangesRequestedOrders.filter(
			(order: any) => order.zipGenerating === true || order.zipSelectedKeysHash
		);
		
		// Filter DELIVERED orders to include those with finalZipGenerating=true OR finalZipFilesHash set
		// This ensures we track DELIVERED orders that are actively generating final ZIPs OR have completed ZIPs
		// (finalZipFilesHash is set when ZIP generation starts, so if it exists, a ZIP was attempted)
		const allDeliveredOrders = deliveredResult.orders || [];
		const deliveredOrdersWithZipActivity = allDeliveredOrders.filter(
			(order: any) => order.finalZipGenerating === true || order.finalZipFilesHash
		);
		
		// Check S3 for regular ZIPs (CLIENT_APPROVED, PREPARING_DELIVERY, and CHANGES_REQUESTED orders)
		// This handles the case where ZIP finished but flag wasn't cleared yet, or flag was cleared but ZIP exists
		// CHANGES_REQUESTED orders need ZIP tracking because they might have been CLIENT_APPROVED with ZIP generating
		const regularZipCheckPromises = [
			...clientApprovedOrdersWithZipActivity,
			...preparingDeliveryOrdersWithZipActivity,
			...changesRequestedOrdersWithZipActivity
		].map(async (order: any) => {
			if (order.zipGenerating === true) {
				// Still generating, no need to check S3
				return { order, zipExists: false, zipType: 'regular' };
			}
			
			// Flag cleared but hash exists - check if ZIP actually exists in S3
			const zipKey = `galleries/${order.galleryId}/zips/${order.orderId}.zip`;
			
			try {
				await s3.send(new HeadObjectCommand({
					Bucket: bucket,
					Key: zipKey
				}));
				return { order, zipExists: true, zipType: 'regular' };
			} catch (headErr: any) {
				if (headErr.name === 'NotFound' || headErr.name === 'NoSuchKey') {
					return { order, zipExists: false, zipType: 'regular' };
				}
				// For other errors, assume ZIP doesn't exist
				return { order, zipExists: false, zipType: 'regular' };
			}
		});
		
		// Check S3 for final ZIPs (DELIVERED orders)
		// This handles the case where ZIP finished but flag wasn't cleared yet, or flag was cleared but ZIP exists
		const finalZipCheckPromises = deliveredOrdersWithZipActivity.map(async (order: any) => {
			if (order.finalZipGenerating === true) {
				// Still generating, no need to check S3
				return { order, zipExists: false, zipType: 'final' };
			}
			
			// Flag cleared but hash exists - check if ZIP actually exists in S3
			const filename = `gallery-${order.galleryId}-order-${order.orderId}-final.zip`;
			const zipKey = `galleries/${order.galleryId}/orders/${order.orderId}/final-zip/${filename}`;
			
			try {
				await s3.send(new HeadObjectCommand({
					Bucket: bucket,
					Key: zipKey
				}));
				return { order, zipExists: true, zipType: 'final' };
			} catch (headErr: any) {
				if (headErr.name === 'NotFound' || headErr.name === 'NoSuchKey') {
					return { order, zipExists: false, zipType: 'final' };
				}
				// For other errors, assume ZIP doesn't exist
				return { order, zipExists: false, zipType: 'final' };
			}
		});
		
		// Check all ZIPs in parallel
		const [regularZipCheckResults, finalZipCheckResults] = await Promise.all([
			Promise.all(regularZipCheckPromises),
			Promise.all(finalZipCheckPromises)
		]);
		
		// Create maps of order keys to zip existence for quick lookup
		const regularZipExistsMap = new Map<string, boolean>();
		regularZipCheckResults.forEach(({ order, zipExists }) => {
			const key = `${order.galleryId}:${order.orderId}`;
			regularZipExistsMap.set(key, zipExists);
		});
		
		const finalZipExistsMap = new Map<string, boolean>();
		finalZipCheckResults.forEach(({ order, zipExists }) => {
			const key = `${order.galleryId}:${order.orderId}`;
			finalZipExistsMap.set(key, zipExists);
		});
		
		// Filter to only include orders that are generating OR have ZIPs that exist
		// Separate CLIENT_APPROVED, PREPARING_DELIVERY, and CHANGES_REQUESTED orders
		const clientApprovedOrdersToInclude = regularZipCheckResults
			.filter(({ order, zipExists }) => 
				order.deliveryStatus === 'CLIENT_APPROVED' && (order.zipGenerating === true || zipExists)
			)
			.map(({ order }) => order);
		
		const preparingDeliveryOrdersToInclude = regularZipCheckResults
			.filter(({ order, zipExists }) => 
				order.deliveryStatus === 'PREPARING_DELIVERY' && (order.zipGenerating === true || zipExists)
			)
			.map(({ order }) => order);
		
		const changesRequestedOrdersToInclude = regularZipCheckResults
			.filter(({ order, zipExists }) => 
				order.deliveryStatus === 'CHANGES_REQUESTED' && (order.zipGenerating === true || zipExists)
			)
			.map(({ order }) => order);
		
		const deliveredOrdersToInclude = finalZipCheckResults
			.filter(({ order, zipExists }) => order.finalZipGenerating === true || zipExists)
			.map(({ order }) => order);
		
		// Log debug info to help diagnose issues
		logger?.info('Order query results', {
			ownerId,
			changesRequested: {
				total: allChangesRequestedOrders.length,
				withZipActivity: changesRequestedOrdersWithZipActivity.length,
				included: changesRequestedOrdersToInclude.length
			},
			clientApproved: {
				total: allClientApprovedOrders.length,
				withZipActivity: clientApprovedOrdersWithZipActivity.length,
				included: clientApprovedOrdersToInclude.length
			},
			preparingDelivery: {
				total: allPreparingDeliveryOrders.length,
				withZipActivity: preparingDeliveryOrdersWithZipActivity.length,
				included: preparingDeliveryOrdersToInclude.length
			},
			delivered: {
				total: allDeliveredOrders.length,
				withZipActivity: deliveredOrdersWithZipActivity.length,
				included: deliveredOrdersToInclude.length
			}
		});
		
		// Combine results from all queries
		// CHANGES_REQUESTED orders are included if they have ZIP activity, otherwise they're included without ZIP status
		// This ensures we track ZIP status even when order status changes (e.g., CLIENT_APPROVED → CHANGES_REQUESTED)
		const changesRequestedOrdersWithZipIds = new Set(changesRequestedOrdersToInclude.map((o: any) => o.orderId));
		const allOrders = [
			// Include CHANGES_REQUESTED orders with ZIP activity (already filtered above)
			...changesRequestedOrdersToInclude,
			// Include other CHANGES_REQUESTED orders without ZIP activity (for status display)
			...(allChangesRequestedOrders.filter((o: any) => !changesRequestedOrdersWithZipIds.has(o.orderId))),
			...clientApprovedOrdersToInclude,
			...preparingDeliveryOrdersToInclude,
			...deliveredOrdersToInclude
		];
		
		const queryDuration = Date.now() - queryStartTime;

		// Extract status fields and ZIP generation status for efficient response
		const orders = allOrders.map((order: any) => {
			const orderData: any = {
				orderId: order.orderId,
				galleryId: order.galleryId,
				deliveryStatus: order.deliveryStatus,
				paymentStatus: order.paymentStatus,
				amount: order.amount,
				state: order.state,
				updatedAt: order.updatedAt
			};
			
			// Helper function to build progress object from separate fields or object
			const buildProgressObject = (
				progressValue: any,
				progressTotal: number | undefined,
				progressPercent: number | undefined
			) => {
				// If progressValue is an object (new format), use it directly
				if (progressValue && typeof progressValue === 'object' && !Array.isArray(progressValue)) {
					// Check if it has the expected structure
					if (progressValue.processed !== undefined || progressValue.total !== undefined) {
						return {
							processed: progressValue.processed,
							total: progressValue.total,
							percent: progressValue.progressPercent || progressValue.percent,
							status: progressValue.status,
							message: progressValue.message,
							error: progressValue.error
						};
					}
				}
				// If progressValue is a number and we have separate fields (old format), construct object
				if (typeof progressValue === 'number' && progressTotal !== undefined && progressTotal > 0) {
					return {
						processed: progressValue,
						total: progressTotal,
						percent: progressPercent !== undefined ? progressPercent : Math.round((progressValue / progressTotal) * 100)
					};
				}
				return undefined;
			};
			
			// Include ZIP generation status for user-selected originals (if generating or completed)
			if (order.zipGenerating || order.zipSelectedKeysHash) {
				const userSelectedProgress = buildProgressObject(
					order.zipProgress,
					order.zipProgressTotal,
					order.zipProgressPercent
				);
				
				// Check if ZIP exists using the pre-computed map
				const orderKey = `${order.galleryId}:${order.orderId}`;
				const zipExists = regularZipExistsMap.get(orderKey) || false;
				const isGenerating = order.zipGenerating === true;
				
				orderData.zipStatusUserSelected = {
					isGenerating,
					type: 'original',
					progress: userSelectedProgress,
					ready: !isGenerating && zipExists // Ready if not generating and ZIP exists
				};
			}
			
			// Include ZIP generation status for finals (if generating or completed)
			if (order.finalZipGenerating || order.finalZipFilesHash) {
				const finalProgress = buildProgressObject(
					order.finalZipProgress,
					order.finalZipProgressTotal,
					order.finalZipProgressPercent
				);
				
				// Check if ZIP exists using the pre-computed map
				const orderKey = `${order.galleryId}:${order.orderId}`;
				const zipExists = finalZipExistsMap.get(orderKey) || false;
				const isGenerating = order.finalZipGenerating === true;
				
				orderData.zipStatusFinal = {
					isGenerating,
					type: 'final',
					progress: finalProgress,
					ready: !isGenerating && zipExists // Ready if not generating and ZIP exists
				};
			}
			
			return orderData;
		});

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

