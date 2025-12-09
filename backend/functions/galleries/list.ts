import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { listTransactionsByUser } from '../../lib/src/transactions';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

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

	// Parse pagination parameters
	const limitParam = event?.queryStringParameters?.limit;
	const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50; // Default 50, max 100
	const cursorParam = event?.queryStringParameters?.cursor;
	let cursor: { galleryId: string; createdAt: string } | null = null;
	if (cursorParam) {
		try {
			cursor = JSON.parse(decodeURIComponent(cursorParam));
		} catch (err) {
			// Invalid cursor, ignore
		}
	}

		try {
		// OPTIMIZATION: Run independent queries in parallel
		const [ordersData, transactionsData] = await Promise.all([
			// Pre-fetch all orders for this user (parallel with transactions)
			ordersTable ? (async () => {
				try {
					const allOrders: any[] = [];
					let lastKey: Record<string, any> | undefined;
		
					// Fetch all orders in parallel batches
					const orderBatches: Promise<any>[] = [];
					
					// First batch - get all orders
					do {
						const batchPromise = ddb.send(new QueryCommand({
					TableName: ordersTable,
					IndexName: 'ownerId-deliveryStatus-index',
					KeyConditionExpression: 'ownerId = :o',
							ExpressionAttributeValues: { ':o': requester },
							ExclusiveStartKey: lastKey
						}));
						orderBatches.push(batchPromise);
						
						const result = await batchPromise;
						allOrders.push(...(result.Items || []));
						lastKey = result.LastEvaluatedKey;
					} while (lastKey && orderBatches.length < 5); // Limit to 5 batches to prevent timeout
					
					return allOrders;
				} catch (err) {
					console.warn('Failed to pre-fetch orders:', err);
					return [];
				}
			})() : Promise.resolve([]),
			
			// Pre-fetch all paid transactions for this user (parallel with orders)
			transactionsTable ? (async () => {
				try {
					const paidTransactions = new Map<string, boolean>();
					let lastKey: Record<string, any> | undefined;
					
					do {
						const result = await listTransactionsByUser(requester, {
							status: 'PAID',
							limit: 100,
							exclusiveStartKey: lastKey
						});
						
						result.transactions.forEach((tx: any) => {
							if (tx.galleryId) {
								paidTransactions.set(tx.galleryId, true);
							}
						});
						
						lastKey = result.hasMore ? result.lastKey : undefined;
					} while (lastKey);
					
					return paidTransactions;
				} catch (err) {
					console.warn('Failed to batch query transactions:', err);
					return new Map<string, boolean>();
				}
			})() : Promise.resolve(new Map<string, boolean>())
		]);

		// Organize orders by gallery
		const allOrdersByGallery: Map<string, any[]> = new Map();
		ordersData.forEach((order: any) => {
					if (order.galleryId) {
						if (!allOrdersByGallery.has(order.galleryId)) {
							allOrdersByGallery.set(order.galleryId, []);
						}
						allOrdersByGallery.get(order.galleryId)!.push(order);
					}
				});

		// Determine target gallery IDs based on filter
		let targetGalleryIds: Set<string> | null = null;
		
		if (filter && filter !== 'unpaid' && ordersData.length > 0) {
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
					deliveryStatuses.push('PREPARING_DELIVERY');
					break;
				case 'dostarczone':
					deliveryStatuses.push('DELIVERED');
					break;
			}
			
			if (deliveryStatuses.length > 0) {
				targetGalleryIds = new Set<string>();
				
				// Filter orders by status and collect gallery IDs
				ordersData.forEach((order: any) => {
					if (order.galleryId && deliveryStatuses.includes(order.deliveryStatus)) {
								targetGalleryIds!.add(order.galleryId);
					}
				});
				
				// For 'dostarczone', verify ALL orders are DELIVERED
				if (filter === 'dostarczone' && targetGalleryIds.size > 0) {
					const galleriesToCheck = Array.from(targetGalleryIds);
					const verifiedGalleryIds = new Set<string>();
					
					galleriesToCheck.forEach(galleryId => {
						const orders = allOrdersByGallery.get(galleryId) || [];
						if (orders.length > 0 && orders.every((o: any) => o.deliveryStatus === 'DELIVERED')) {
							verifiedGalleryIds.add(galleryId);
						}
					});
					
					targetGalleryIds = verifiedGalleryIds.size > 0 ? verifiedGalleryIds : new Set();
							}
			}
		}

		// OPTIMIZATION: Only fetch galleries we need
		// If we have target gallery IDs, use BatchGet (faster) or query only those
		// Otherwise, use paginated query
		let needsAllGalleries = filter === undefined || filter === 'unpaid';
		const allGalleryItems: any[] = [];
		
		if (targetGalleryIds && targetGalleryIds.size > 0) {
			// OPTIMIZATION: For filtered queries, only fetch target galleries
			// Use BatchGet for small sets, otherwise query in batches
			const galleryIdArray = Array.from(targetGalleryIds);
						
			if (galleryIdArray.length <= 100) {
				// Use BatchGet for up to 100 items (DynamoDB limit)
				const batchSize = 100;
				for (let i = 0; i < galleryIdArray.length; i += batchSize) {
					const batch = galleryIdArray.slice(i, i + batchSize);
					const keys = batch.map(galleryId => ({ galleryId }));
					
					try {
						const batchResult = await ddb.send(new BatchGetCommand({
							RequestItems: {
								[galleriesTable]: {
									Keys: keys
								}
							}
						}));
						
						if (batchResult.Responses?.[galleriesTable]) {
							allGalleryItems.push(...batchResult.Responses[galleriesTable]);
					}
					} catch (err) {
						console.warn('BatchGet failed, falling back to querying all galleries:', err);
						// Fallback to querying all galleries
						needsAllGalleries = true;
				}
			}
			} else {
				// Too many galleries, fall back to querying all
				needsAllGalleries = true;
			}
		}
		
		// If we still need all galleries (no filter, unpaid filter, or BatchGet failed)
		if (needsAllGalleries || allGalleryItems.length === 0) {
		let lastEvaluatedKey: Record<string, any> | undefined = undefined;
		
			// OPTIMIZATION: For unpaid filter or no filter, use pagination at DynamoDB level
			if ((filter === 'unpaid' || !filter) && !cursor) {
			const queryParams: any = {
				TableName: galleriesTable,
				IndexName: 'ownerId-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: { ':o': requester },
				ScanIndexForward: false, // newest first
					Limit: limit + 20 // Fetch extra to account for filtering
			};
			
				const galleriesQuery = await ddb.send(new QueryCommand(queryParams));
			allGalleryItems.push(...(galleriesQuery.Items || []));
		} else {
				// Need all galleries for filtering - but limit to reasonable amount
				const MAX_GALLERIES_TO_FETCH = 1000; // Safety limit
				let fetchedCount = 0;
				
			do {
				const queryParams: any = {
					TableName: galleriesTable,
					IndexName: 'ownerId-index',
					KeyConditionExpression: 'ownerId = :o',
					ExpressionAttributeValues: { ':o': requester },
						ScanIndexForward: false,
						Limit: 100 // Fetch in chunks
				};
				
				if (lastEvaluatedKey) {
					queryParams.ExclusiveStartKey = lastEvaluatedKey;
				}
				
					const galleriesQuery = await ddb.send(new QueryCommand(queryParams));
					const items = galleriesQuery.Items || [];
					allGalleryItems.push(...items);
				lastEvaluatedKey = galleriesQuery.LastEvaluatedKey;
					fetchedCount += items.length;
					
					// Early termination if we have enough for filtering
					if (targetGalleryIds && allGalleryItems.length >= targetGalleryIds.size * 2) {
						break;
					}
					
					if (fetchedCount >= MAX_GALLERIES_TO_FETCH) {
						break;
					}
			} while (lastEvaluatedKey);
			}
		}

		const cloudfrontDomain = envProc?.env?.CLOUDFRONT_DOMAIN as string;
		
		// Transform galleries (lightweight operation)
		const galleries = allGalleryItems.map((g: any) => {
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
				clientEmail: g.clientEmail,
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

		// Filter by target gallery IDs if needed
		let galleriesToProcess = galleries;
		if (targetGalleryIds && targetGalleryIds.size > 0) {
			galleriesToProcess = galleries.filter((g: any) => targetGalleryIds!.has(g.galleryId));
		}
		
		// OPTIMIZATION: Enrich galleries in parallel batches (no sequential await)
		const BATCH_SIZE = 50;
		const enrichmentPromises: Promise<any>[] = [];
		
		for (let i = 0; i < galleriesToProcess.length; i += BATCH_SIZE) {
			const batch = galleriesToProcess.slice(i, i + BATCH_SIZE);
			batch.forEach((g: any) => {
				enrichmentPromises.push((async () => {
			let orderData = { 
				changeRequestPending: false, 
				orderCount: 0, 
				totalRevenueCents: 0, 
				latestOrder: null as any | null,
				orders: [] as any[],
				orderStatuses: [] as string[]
			};
			
					const orders = allOrdersByGallery.get(g.galleryId) || [];
			
			if (orders.length > 0) {
				const changeRequestPending = orders.some((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
				const orderStatuses = orders.map((o: any) => o.deliveryStatus).filter(Boolean);
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

					const isPaid = transactionsData.has(g.galleryId);
					const paymentStatus = isPaid ? 'PAID' : 'UNPAID';

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
				})());
			});
		}
		
		// Wait for all enrichments in parallel
		const enrichmentResults = await Promise.allSettled(enrichmentPromises);
		const enrichedGalleries = enrichmentResults
			.map((result) => {
				if (result.status === 'fulfilled') {
					return result.value;
				} else {
					console.warn('Failed to enrich gallery:', result.reason);
					return null;
				}
			})
			.filter((g): g is NonNullable<typeof g> => g !== null);

		// Apply filters
		let filteredGalleries = enrichedGalleries;
		if (filter) {
			switch (filter) {
			case 'unpaid':
				filteredGalleries = enrichedGalleries.filter((g: any) => !g.isPaid);
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
						return g.orders.some((o: any) => 
							o.deliveryStatus === 'PREPARING_DELIVERY'
						);
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

		// Sort by createdAt descending (newest first)
		filteredGalleries.sort((a: any, b: any) => {
			const timeA = new Date(a.createdAt || 0).getTime();
			const timeB = new Date(b.createdAt || 0).getTime();
			return timeB - timeA;
		});

		// Apply cursor-based pagination
		let paginatedGalleries = filteredGalleries;
		if (cursor) {
			const cursorIndex = filteredGalleries.findIndex((g: any) => 
				g.galleryId === cursor!.galleryId && g.createdAt === cursor!.createdAt
			);
			if (cursorIndex >= 0) {
				paginatedGalleries = filteredGalleries.slice(cursorIndex + 1);
			}
		}

		// Apply limit
		const hasMore = paginatedGalleries.length > limit;
		const items = paginatedGalleries.slice(0, limit);

		// Generate next cursor from last item
		let nextCursor: string | null = null;
		if (hasMore && items.length > 0) {
			const lastItem = items[items.length - 1];
			nextCursor = encodeURIComponent(JSON.stringify({
				galleryId: lastItem.galleryId,
				createdAt: lastItem.createdAt
			}));
		}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			items,
			hasMore,
			nextCursor
		})
		};
	} catch (error: any) {
		console.error('List galleries failed:', error);
		return createLambdaErrorResponse(error, 'Failed to list galleries', 500);
	}
});
