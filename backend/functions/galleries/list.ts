import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { listTransactionsByUser, getPaidTransactionForGallery } from '../../lib/src/transactions';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Valid filter values
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

	// Get and validate filter from query string (optional)
	const filterParam = event?.queryStringParameters?.filter;
	const filter: FilterType | undefined = filterParam && VALID_FILTERS.includes(filterParam as FilterType) 
		? (filterParam as FilterType) 
		: undefined;

	try {
		// For workflow status filters, optimize by querying orders first (DB-level filtering)
		// This avoids N+1 queries and only fetches relevant galleries
		let targetGalleryIds: Set<string> | null = null;
		const allOrdersByGallery: Map<string, any[]> = new Map();
		
		// For 'unpaid' filter, pre-fetch all orders by ownerId to determine which galleries have orders
		// This avoids N individual order queries per gallery
		if (filter === 'unpaid' && ordersTable) {
			try {
				// Query all orders for this owner using GSI (single query)
				// We'll use this to determine which galleries have orders
				const allOrdersQuery = await ddb.send(new QueryCommand({
					TableName: ordersTable,
					IndexName: 'ownerId-deliveryStatus-index',
					KeyConditionExpression: 'ownerId = :o',
					ExpressionAttributeValues: { ':o': requester }
				}));
				
				// Group orders by galleryId
				(allOrdersQuery.Items || []).forEach((order: any) => {
					if (order.galleryId) {
						if (!allOrdersByGallery.has(order.galleryId)) {
							allOrdersByGallery.set(order.galleryId, []);
						}
						allOrdersByGallery.get(order.galleryId)!.push(order);
					}
				});
			} catch (err) {
				// If GSI query fails, fall back to individual queries per gallery
				console.warn('Failed to pre-fetch orders for unpaid filter:', err);
			}
		}
		
		if (filter && filter !== 'unpaid' && ordersTable) {
			// Map filter to delivery statuses
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
			
			// Query orders by ownerId and deliveryStatus using GSI (single query per status)
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
					
					// Collect unique galleryIds and group orders by gallery
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
					
					// For 'dostarczone', we need to check that ALL orders are DELIVERED
					// Fetch all orders for these galleries to verify
					if (filter === 'dostarczone' && targetGalleryIds.size > 0) {
						// Always fetch all orders to ensure we have complete data for verification
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
							
							// Update orders map with all orders
							allOrdersQueries.forEach((result, idx) => {
								const galleryId = galleriesNeedingFullOrders[idx];
								allOrdersByGallery.set(galleryId, result.Items || []);
							});
						}
					}
				} catch (gsiError: any) {
					// Fallback: If GSI query fails, use original method
					console.warn('GSI query failed, falling back to gallery-based queries:', gsiError.message);
					targetGalleryIds = null;
				}
			}
		}
		
		// Query galleries by ownerId (consolidated - same query for all cases)
		// Note: We query all galleries and filter in memory for workflow filters
		// This is still more efficient than N+1 queries since we pre-fetch orders via GSI
		const galleriesQuery = await ddb.send(new QueryCommand({
			TableName: galleriesTable,
			IndexName: 'ownerId-index',
			KeyConditionExpression: 'ownerId = :o',
			ExpressionAttributeValues: { ':o': requester },
			ScanIndexForward: false // newest first
		}));

		const cloudfrontDomain = envProc?.env?.CLOUDFRONT_DOMAIN as string;
		
		const galleries = (galleriesQuery.Items || []).map((g: any) => {
			// Convert coverPhotoUrl from S3 to CloudFront if needed
			let coverPhotoUrl = g.coverPhotoUrl;
			if (coverPhotoUrl && cloudfrontDomain) {
				// Check if it's an S3 URL (contains .s3. or s3.amazonaws.com) and not already CloudFront
				const isS3Url = coverPhotoUrl.includes('.s3.') || coverPhotoUrl.includes('s3.amazonaws.com');
				const isCloudFrontUrl = coverPhotoUrl.includes(cloudfrontDomain);
				
				if (isS3Url && !isCloudFrontUrl) {
					// Extract S3 key from URL
					// Format: https://bucket.s3.region.amazonaws.com/key or https://bucket.s3.amazonaws.com/key
					try {
						const urlObj = new URL(coverPhotoUrl);
						const s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
						if (s3Key) {
							// Build CloudFront URL - encode path segments
							coverPhotoUrl = `https://${cloudfrontDomain}/${s3Key.split('/').map(encodeURIComponent).join('/')}`;
						}
					} catch (err) {
						// If URL parsing fails, keep original URL
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
				// Removed selectionLocked and changeRequestPending - these are derived from orders below
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
				storageLimitBytes: g.storageLimitBytes, // Backward compatibility
				bytesUsed: g.bytesUsed || 0, // Backward compatibility
				expiresAt: g.expiresAt,
				createdAt: g.createdAt,
				updatedAt: g.updatedAt,
				coverPhotoUrl
			};
		});

		// Filter galleries if we have target galleryIds (for workflow status filters)
		let galleriesToProcess = galleries;
		if (targetGalleryIds && targetGalleryIds.size > 0) {
			galleriesToProcess = galleries.filter((g: any) => targetGalleryIds!.has(g.galleryId));
		}
		
		// Pre-fetch all paid transactions for this user (single query instead of N queries)
		// This significantly improves performance for large datasets
		const paidTransactionsByGallery = new Map<string, boolean>();
		if (transactionsTable && galleriesToProcess.length > 0) {
			try {
				// Query all PAID transactions for this user
				let lastKey: Record<string, any> | undefined;
				do {
					const transactionsResult = await listTransactionsByUser(requester, {
						status: 'PAID',
						limit: 100,
						exclusiveStartKey: lastKey
					});
					
					// Map galleryId to isPaid status
					transactionsResult.transactions.forEach((tx: any) => {
						if (tx.galleryId) {
							paidTransactionsByGallery.set(tx.galleryId, true);
						}
					});
					
					lastKey = transactionsResult.hasMore ? transactionsResult.lastKey : undefined;
				} while (lastKey);
			} catch (err) {
				// If batch query fails, fall back to individual queries per gallery
				console.warn('Failed to batch query transactions, falling back to individual queries:', err);
			}
		}
		
		// Enrich with order summaries and payment status (done in parallel with error resilience)
		// Use Promise.allSettled to handle individual gallery failures gracefully
		const enrichmentResults = await Promise.allSettled(galleriesToProcess.map(async (g: any) => {
			let orderData = { 
				changeRequestPending: false, 
				orderCount: 0, 
				totalRevenueCents: 0, 
				latestOrder: null as any | null,
				orders: [] as any[],
				orderStatuses: [] as string[]
			};
			
			// Use pre-fetched orders if available (from GSI query), otherwise query
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
			
			// Process orders data
			if (orders.length > 0) {
				// Derive changeRequestPending from CHANGES_REQUESTED order status (not from gallery flag)
				const changeRequestPending = orders.some((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
				const orderStatuses = orders.map((o: any) => o.deliveryStatus).filter(Boolean);
				// Calculate total revenue: sum of all order totals (additional photos) + photography package price
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

			// Derive payment status from transactions
			// Use pre-fetched batch result if available, otherwise query individually
			let isPaid = false;
			let paymentStatus = 'UNPAID';
			
			if (paidTransactionsByGallery.has(g.galleryId)) {
				// Use pre-fetched batch result (fast path)
				isPaid = true;
				paymentStatus = 'PAID';
			} else if (paidTransactionsByGallery.size > 0) {
				// We did a batch query but this gallery wasn't in the results
				// This means it's not paid (fast path)
				isPaid = false;
				paymentStatus = 'UNPAID';
			} else {
				// Fallback: individual query (only if batch query failed or wasn't attempted)
				try {
					const paidTransaction = await getPaidTransactionForGallery(g.galleryId);
					isPaid = !!paidTransaction;
					paymentStatus = isPaid ? 'PAID' : 'UNPAID';
				} catch (err) {
					// If transaction check fails, fall back to gallery state
					isPaid = g.state === 'PAID_ACTIVE';
					paymentStatus = isPaid ? 'PAID' : 'UNPAID';
				}
			}

			// Update state based on payment status
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
		
		// Process results - filter out failed enrichments and log errors
		const enrichedGalleries = enrichmentResults
			.map((result, idx) => {
				if (result.status === 'fulfilled') {
					return result.value;
				} else {
					// Log error but continue processing other galleries
					console.warn(`Failed to enrich gallery ${galleriesToProcess[idx]?.galleryId}:`, result.reason);
					return null;
				}
			})
			.filter((g): g is NonNullable<typeof g> => g !== null);

		// Apply filtering based on order statuses
		let filteredGalleries = enrichedGalleries;
		if (filter) {
			switch (filter) {
				case 'unpaid':
					// Wersje robocze: unpaid galleries with no orders OR paid galleries with no orders
					// Once a gallery (paid or unpaid) has orders, it should appear in workflow status views
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						// Galleries with orders should be in workflow status views, not drafts
						if (g.orders && g.orders.length > 0) return false;
						
						// Unpaid galleries with no orders are drafts
						if (!g.isPaid) return true;
						
						// Paid galleries with no orders are still drafts (not sent to client yet)
						return true;
					});
					break;
				case 'wyslano':
					// Wysłano do klienta: galleries with CLIENT_SELECTING orders only
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.some((o: any) => o.deliveryStatus === 'CLIENT_SELECTING');
					});
					break;
				case 'wybrano':
					// Wybrano zdjęcia: CLIENT_APPROVED or AWAITING_FINAL_PHOTOS
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.some((o: any) => 
							o.deliveryStatus === 'CLIENT_APPROVED' ||
							o.deliveryStatus === 'AWAITING_FINAL_PHOTOS'
						);
					});
					break;
				case 'prosba-o-zmiany':
					// Prośba o zmiany: CHANGES_REQUESTED
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.some((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
					});
					break;
				case 'gotowe-do-wysylki':
					// Gotowe do wysyłki: PREPARING_FOR_DELIVERY
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.some((o: any) => o.deliveryStatus === 'PREPARING_FOR_DELIVERY');
					});
					break;
				case 'dostarczone':
					// Dostarczone: all orders DELIVERED
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						if (!g.orders || g.orders.length === 0) return false;
						return g.orders.every((o: any) => o.deliveryStatus === 'DELIVERED');
					});
					break;
				default:
					// No filter or unknown filter - return all
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
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list galleries', message: error.message })
	};
	}
});

