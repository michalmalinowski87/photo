import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { listTransactionsByUser, getPaidTransactionForGallery } from '../../lib/src/transactions';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const VALID_FILTERS = ['unpaid', 'wyslano', 'wybrano', 'prosba-o-zmiany', 'gotowe-do-wysylki', 'dostarczone'] as const;
type FilterType = typeof VALID_FILTERS[number];

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
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

	const filterParam = event?.queryStringParameters?.filter;
	const filter: FilterType | undefined = filterParam && VALID_FILTERS.includes(filterParam as FilterType) 
		? (filterParam as FilterType) 
		: undefined;

		try {
		// For workflow status filters, optimize by querying orders first (DB-level filtering) to avoid N+1 queries
		let targetGalleryIds: Set<string> | null = null;
		const allOrdersByGallery: Map<string, any[]> = new Map();
		
		// For 'unpaid' filter, pre-fetch all orders by ownerId to avoid N individual order queries per gallery
		if (filter === 'unpaid' && ordersTable) {
			try {
				const allOrdersQuery = await ddb.send(new QueryCommand({
					TableName: ordersTable,
					IndexName: 'ownerId-deliveryStatus-index',
					KeyConditionExpression: 'ownerId = :o',
					ExpressionAttributeValues: { ':o': requester }
				}));
				
				(allOrdersQuery.Items || []).forEach((order: any) => {
					if (order.galleryId) {
						if (!allOrdersByGallery.has(order.galleryId)) {
							allOrdersByGallery.set(order.galleryId, []);
						}
						allOrdersByGallery.get(order.galleryId)!.push(order);
					}
				});
			} catch (err) {
				console.warn('Failed to pre-fetch orders for unpaid filter:', err);
			}
		}
		
		if (filter && filter !== 'unpaid' && ordersTable) {
			const deliveryStatuses: string[] = [];
			switch (filter) {
				case 'wyslano':
					deliveryStatuses.push('CLIENT_SELECTING');
					break;
				case 'wybrano':
					deliveryStatuses.push('CLIENT_APPROVED', 'AWAITING_FINAL_PHOTOS');
					break;
				case 'prosba-o-zmiany':
					deliveryStatuses.push('CHANGES_REQUESTED');
					break;
				case 'gotowe-do-wysylki':
					deliveryStatuses.push('PREPARING_FOR_DELIVERY');
					break;
				case 'dostarczone':
					deliveryStatuses.push('DELIVERED');
					break;
			}
			
			if (deliveryStatuses.length > 0) {
				try {
					const orderQueries = await Promise.all(
						deliveryStatuses.map(status =>
							ddb.send(new QueryCommand({
								TableName: ordersTable,
								IndexName: 'ownerId-deliveryStatus-index',
								KeyConditionExpression: 'ownerId = :o AND deliveryStatus = :ds',
								ExpressionAttributeValues: {
									':o': requester,
									':ds': status
								}
							}))
						)
					);
					
					targetGalleryIds = new Set<string>();
					orderQueries.forEach(result => {
						(result.Items || []).forEach((order: any) => {
							if (order.galleryId) {
								targetGalleryIds!.add(order.galleryId);
								if (!allOrdersByGallery.has(order.galleryId)) {
									allOrdersByGallery.set(order.galleryId, []);
								}
								allOrdersByGallery.get(order.galleryId)!.push(order);
							}
						});
					});
					
					// For 'dostarczone', check that ALL orders are DELIVERED - fetch all orders to verify
					if (filter === 'dostarczone' && targetGalleryIds.size > 0) {
						const galleriesNeedingFullOrders = Array.from(targetGalleryIds);
						
						if (galleriesNeedingFullOrders.length > 0) {
							const allOrdersQueries = await Promise.all(
								galleriesNeedingFullOrders.map(galleryId =>
									ddb.send(new QueryCommand({
										TableName: ordersTable,
										KeyConditionExpression: 'galleryId = :g',
										ExpressionAttributeValues: { ':g': galleryId }
									}))
								)
							);
							
							allOrdersQueries.forEach((result, idx) => {
								const galleryId = galleriesNeedingFullOrders[idx];
								allOrdersByGallery.set(galleryId, result.Items || []);
							});
						}
					}
				} catch (gsiError: any) {
					console.warn('GSI query failed, falling back to gallery-based queries:', gsiError.message);
					targetGalleryIds = null;
				}
			}
		}
		
		// Query all galleries and filter in memory for workflow filters - more efficient than N+1 queries since we pre-fetch orders via GSI
		const galleriesQuery = await ddb.send(new QueryCommand({
			TableName: galleriesTable,
			IndexName: 'ownerId-index',
			KeyConditionExpression: 'ownerId = :o',
			ExpressionAttributeValues: { ':o': requester },
			ScanIndexForward: false // newest first
		}));

		const cloudfrontDomain = envProc?.env?.CLOUDFRONT_DOMAIN as string;
		
		const galleries = (galleriesQuery.Items || []).map((g: any) => {
			let coverPhotoUrl = g.coverPhotoUrl;
			if (coverPhotoUrl && cloudfrontDomain) {
				const isS3Url = coverPhotoUrl.includes('.s3.') || coverPhotoUrl.includes('s3.amazonaws.com');
				const isCloudFrontUrl = coverPhotoUrl.includes(cloudfrontDomain);
				
				if (isS3Url && !isCloudFrontUrl) {
					try {
						const urlObj = new URL(coverPhotoUrl);
						const s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
						if (s3Key) {
							coverPhotoUrl = `https://${cloudfrontDomain}/${s3Key.split('/').map(encodeURIComponent).join('/')}`;
						}
					} catch (err) {
						// URL parsing failed, keep original
					}
				}
			}
			
			return {
				galleryId: g.galleryId,
				galleryName: g.galleryName,
				ownerId: g.ownerId,
				state: g.state,
				selectionEnabled: g.selectionEnabled,
				selectionStatus: g.selectionStatus,
				pricingPackage: g.pricingPackage,
				selectionStats: g.selectionStats,
				currentOrderId: g.currentOrderId,
				lastOrderNumber: g.lastOrderNumber,
				clientEmail: g.clientEmail, // Include clientEmail for "Send to Client" button visibility
				plan: g.plan,
				priceCents: g.priceCents,
				originalsLimitBytes: g.originalsLimitBytes,
				finalsLimitBytes: g.finalsLimitBytes,
				originalsBytesUsed: g.originalsBytesUsed || 0,
				finalsBytesUsed: g.finalsBytesUsed || 0,
				storageLimitBytes: g.storageLimitBytes,
				expiresAt: g.expiresAt,
				createdAt: g.createdAt,
				updatedAt: g.updatedAt,
				coverPhotoUrl
			};
		});

		let galleriesToProcess = galleries;
		if (targetGalleryIds && targetGalleryIds.size > 0) {
			galleriesToProcess = galleries.filter((g: any) => targetGalleryIds!.has(g.galleryId));
		}
		
		// Pre-fetch all paid transactions for this user (single query instead of N queries) for better performance
		const paidTransactionsByGallery = new Map<string, boolean>();
		if (transactionsTable && galleriesToProcess.length > 0) {
			try {
				let lastKey: Record<string, any> | undefined;
				do {
					const transactionsResult = await listTransactionsByUser(requester, {
						status: 'PAID',
						limit: 100,
						exclusiveStartKey: lastKey
					});
					
					transactionsResult.transactions.forEach((tx: any) => {
						if (tx.galleryId) {
							paidTransactionsByGallery.set(tx.galleryId, true);
						}
					});
					
					lastKey = transactionsResult.hasMore ? transactionsResult.lastKey : undefined;
				} while (lastKey);
			} catch (err) {
				console.warn('Failed to batch query transactions, falling back to individual queries:', err);
			}
		}
		
		// Enrich with order summaries and payment status - use batching to prevent timeout
		// Process galleries in batches of 50 to avoid overwhelming the system
		const BATCH_SIZE = 50;
		const enrichmentResults: Array<PromiseSettledResult<any>> = [];
		
		for (let i = 0; i < galleriesToProcess.length; i += BATCH_SIZE) {
			const batch = galleriesToProcess.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.allSettled(batch.map(async (g: any) => {
			let orderData = { 
				changeRequestPending: false, 
				orderCount: 0, 
				totalRevenueCents: 0, 
				latestOrder: null as any | null,
				orders: [] as any[],
				orderStatuses: [] as string[]
			};
			
			let orders: any[] = [];
			if (allOrdersByGallery.has(g.galleryId)) {
				orders = allOrdersByGallery.get(g.galleryId)!;
			} else if (ordersTable && g.galleryId) {
				try {
					const ordersQuery = await ddb.send(new QueryCommand({
						TableName: ordersTable,
						KeyConditionExpression: 'galleryId = :g',
						ExpressionAttributeValues: { ':g': g.galleryId }
					}));
					orders = ordersQuery.Items || [];
				} catch (err) {
					// If orders query fails, continue without order data
				}
			}
			
			if (orders.length > 0) {
				const changeRequestPending = orders.some((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
				const orderStatuses = orders.map((o: any) => o.deliveryStatus).filter(Boolean);
				// Total revenue: sum of all order totals (additional photos) + photography package price
				const ordersRevenueCents = orders.reduce((sum: number, o: any) => sum + (o.totalCents || 0), 0);
				const photographyPackagePriceCents = g.pricingPackage?.packagePriceCents || 0;
				const totalRevenueCents = ordersRevenueCents + photographyPackagePriceCents;
				
				orderData = {
					changeRequestPending,
					orderCount: orders.length,
					totalRevenueCents,
					latestOrder: orders.length > 0 ? orders.sort((a: any, b: any) => 
						new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
					)[0] : null,
					orders,
					orderStatuses
				};
			}

			let isPaid = false;
			let paymentStatus = 'UNPAID';
			
			if (paidTransactionsByGallery.has(g.galleryId)) {
				isPaid = true;
				paymentStatus = 'PAID';
			} else if (paidTransactionsByGallery.size > 0) {
				isPaid = false;
				paymentStatus = 'UNPAID';
			} else {
				try {
					const paidTransaction = await getPaidTransactionForGallery(g.galleryId);
					isPaid = !!paidTransaction;
					paymentStatus = isPaid ? 'PAID' : 'UNPAID';
				} catch (err) {
					isPaid = g.state === 'PAID_ACTIVE';
					paymentStatus = isPaid ? 'PAID' : 'UNPAID';
				}
			}

			let effectiveState = g.state;
			if (!isPaid && g.state !== 'EXPIRED') {
				effectiveState = 'DRAFT';
			} else if (isPaid && g.state !== 'EXPIRED') {
				effectiveState = 'PAID_ACTIVE';
			}

			return {
				...g,
				state: effectiveState,
				paymentStatus,
				isPaid,
				...orderData
			};
			}));
			
			enrichmentResults.push(...batchResults);
		}
		
		const enrichedGalleries = enrichmentResults
			.map((result, idx) => {
				if (result.status === 'fulfilled') {
					return result.value;
				} else {
					console.warn(`Failed to enrich gallery ${galleriesToProcess[idx]?.galleryId}:`, result.reason);
					return null;
				}
			})
			.filter((g): g is NonNullable<typeof g> => g !== null);

		let filteredGalleries = enrichedGalleries;
		if (filter) {
			switch (filter) {
				case 'unpaid':
					// Wersje robocze: unpaid galleries with no orders OR paid galleries with no orders
					// Once a gallery (paid or unpaid) has orders, it should appear in workflow status views
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (g.orders && g.orders.length > 0) return false;
						if (!g.isPaid) return true;
						return true;
					});
					break;
				case 'wyslano':
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.some((o: any) => o.deliveryStatus === 'CLIENT_SELECTING');
					});
					break;
				case 'wybrano':
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.some((o: any) => 
							o.deliveryStatus === 'CLIENT_APPROVED' ||
							o.deliveryStatus === 'AWAITING_FINAL_PHOTOS'
						);
					});
					break;
				case 'prosba-o-zmiany':
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.some((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
					});
					break;
				case 'gotowe-do-wysylki':
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.some((o: any) => o.deliveryStatus === 'PREPARING_FOR_DELIVERY');
					});
					break;
				case 'dostarczone':
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.every((o: any) => o.deliveryStatus === 'DELIVERED');
					});
					break;
				default:
					break;
			}
		}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ items: filteredGalleries })
		};
	} catch (error: any) {
		console.error('List galleries failed:', error);
		const { createLambdaErrorResponse } = require('../../lib/src/error-utils');
		return createLambdaErrorResponse(error, 'Failed to list galleries', 500);
	}
});

