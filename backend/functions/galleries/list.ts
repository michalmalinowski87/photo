import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

	// Get filter from query string (optional)
	// Filters: 'unpaid', 'wyslano', 'wybrano', 'prosba-o-zmiany', 'gotowe-do-wysylki', 'dostarczone'
	const filter = event?.queryStringParameters?.filter;

	try {
		// Query galleries by ownerId using GSI
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

		// Optionally enrich with order summaries and payment status (can be done in parallel)
		const enrichedGalleries = await Promise.all(galleries.map(async (g: any) => {
			let orderData = { 
				changeRequestPending: false, 
				orderCount: 0, 
				totalRevenueCents: 0, 
				latestOrder: null as any | null,
				orders: [] as any[],
				orderStatuses: [] as string[]
			};
			if (ordersTable && g.galleryId) {
				try {
					const ordersQuery = await ddb.send(new QueryCommand({
						TableName: ordersTable,
						KeyConditionExpression: 'galleryId = :g',
						ExpressionAttributeValues: { ':g': g.galleryId }
					}));
					const orders = ordersQuery.Items || [];
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
				} catch (err) {
					// If orders query fails, continue without order data
				}
			}

			// Derive payment status from transactions
			let isPaid = false;
			let paymentStatus = 'UNPAID';
			try {
				const paidTransaction = await getPaidTransactionForGallery(g.galleryId);
				isPaid = !!paidTransaction;
				paymentStatus = isPaid ? 'PAID' : 'UNPAID';
			} catch (err) {
				// If transaction check fails, fall back to gallery state
				isPaid = g.state === 'PAID_ACTIVE';
				paymentStatus = isPaid ? 'PAID' : 'UNPAID';
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

		// Apply filtering based on order statuses
		let filteredGalleries = enrichedGalleries;
		if (filter) {
			switch (filter) {
				case 'unpaid':
					// Wersje robocze: unpaid galleries OR paid galleries with no orders
					// Once a paid gallery has orders, it should appear in workflow status views
					filteredGalleries = enrichedGalleries.filter((g: any) => {
						// Unpaid galleries are always drafts
						if (!g.isPaid) return true;
						
						// Paid galleries with no orders are still drafts (not sent to client yet)
						if (!g.orders || g.orders.length === 0) return true;
						
						// Paid galleries with orders should be in workflow status views, not drafts
						return false;
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

