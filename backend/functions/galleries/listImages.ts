import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';
import { getConfigValueFromSsm } from '../../lib/src/ssm-config';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const stage = envProc?.env?.STAGE || 'dev';
	// Read CloudFront domain from SSM Parameter Store (avoids circular dependency in CDK)
	const cloudfrontDomain = await getConfigValueFromSsm(stage, 'CloudFrontDomain') || undefined;
	
	if (!galleriesTable || !imagesTable || !bucket) {
		logger.error('Missing required environment variables', {
			hasGalleriesTable: !!galleriesTable,
			hasImagesTable: !!imagesTable,
			hasBucket: !!bucket,
			hasCloudfrontDomain: !!cloudfrontDomain
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	
	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId' })
		};
	}

	// Parse requested sizes from query string (comma-separated: thumb,preview,bigthumb)
	// If not provided, generate all sizes (backward compatible)
	const requestedSizesParam = event?.queryStringParameters?.sizes;
	const requestedSizes = requestedSizesParam 
		? new Set(requestedSizesParam.split(',').map(s => s.trim().toLowerCase()))
		: new Set(['thumb', 'preview', 'bigthumb']); // Default: all sizes

	// Parse pagination parameters
	const limitParam = event?.queryStringParameters?.limit;
	// For dev: allow very high limits (up to 10000) to show all photos without pagination
	const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 10000) : 50; // Default 50, max 10000 for dev
	const cursorParam = event?.queryStringParameters?.cursor;
	const cursor: string | null = cursorParam ? decodeURIComponent(cursorParam) : null;

	// Parse filter parameters for per-section fetching
	const filterOrderId = event?.queryStringParameters?.filterOrderId; // Filter by specific order
	const filterUnselected = event?.queryStringParameters?.filterUnselected === 'true'; // Filter unselected images

	// Verify gallery exists
	let gallery;
	try {
		const galleryGet = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));
		gallery = galleryGet.Item as any;
		if (!gallery) {
			logger.warn('Gallery not found', { galleryId });
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery not found' })
			};
		}
	} catch (err: any) {
		logger.error('Failed to fetch gallery', {
			error: {
				name: err.name,
				message: err.message,
				stack: err.stack
			},
			galleryId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to fetch gallery', message: err.message })
		};
	}

	// Verify access - supports both owner (Cognito) and client (JWT) tokens
	const access = await verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner && !access.isClient) {
		logger.warn('Invalid or missing authentication', { galleryId });
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	try {
		// Query DynamoDB for image metadata instead of S3 listing
		// Use GSI galleryId-lastModified-index for time-based sorting (newest first)

		// Query DynamoDB for original images (type = 'original')
		// Use GSI for efficient time-based queries
		let allImageRecords: any[] = [];
		let lastEvaluatedKey: any = undefined;
		
		do {
			const queryParams: any = {
				TableName: imagesTable,
				IndexName: 'galleryId-lastModified-index',
				KeyConditionExpression: 'galleryId = :g',
				FilterExpression: '#type = :type',
				ExpressionAttributeNames: {
					'#type': 'type'
				},
				ExpressionAttributeValues: {
					':g': galleryId,
					':type': 'original'
				},
				ScanIndexForward: false, // Descending order (newest first)
				Limit: 1000 // DynamoDB query limit
			};

			if (lastEvaluatedKey) {
				queryParams.ExclusiveStartKey = lastEvaluatedKey;
			}

			const queryResponse = await ddb.send(new QueryCommand(queryParams));
			allImageRecords.push(...(queryResponse.Items || []));
			lastEvaluatedKey = queryResponse.LastEvaluatedKey;
		} while (lastEvaluatedKey);

		// Process image records from DynamoDB
		// Sort by lastModified timestamp (newest first), with filename as secondary sort key
		let sortedOriginals = allImageRecords
			.map(record => ({
				filename: record.filename,
				lastModified: record.lastModified || 0,
				size: record.size || 0,
				s3Key: record.s3Key
			}))
			.sort((a, b) => {
				// Primary sort: by timestamp descending (newest first)
				if (b.lastModified !== a.lastModified) {
					return b.lastModified - a.lastModified;
				}
				// Secondary sort: by filename ascending (for consistent ordering when timestamps are identical)
				return a.filename.localeCompare(b.filename);
			});
		
		// Calculate total count BEFORE filtering (needed for accurate unselectedCount calculation)
		// This ensures totalCount represents all original images, not just filtered ones
		const totalCountBeforeFiltering = sortedOriginals.length;
		
		// originalKeys will be derived from sortedOriginals after filtering

		// Apply filtering based on orderId or unselected filter BEFORE pagination
		// This ensures we only paginate through the relevant images for the section
		if (filterOrderId || filterUnselected) {
			// Fetch orders to determine which images belong to which order
			let allOrderImageKeys: Set<string> | null = null;
			let targetOrderImageKeys: Set<string> | null = null;

			if (ordersTable) {
				try {
					const ordersQuery = await ddb.send(new QueryCommand({
						TableName: ordersTable,
						KeyConditionExpression: 'galleryId = :g',
						ExpressionAttributeValues: { ':g': galleryId }
					}));

					const orders = ordersQuery.Items || [];
					// Filter to delivered orders only
					const deliveredOrders = orders.filter((o: any) => 
						o.deliveryStatus === 'DELIVERED' || 
						o.deliveryStatus === 'PREPARING_DELIVERY' || 
						o.deliveryStatus === 'CLIENT_APPROVED'
					);

					// Build set of all images in orders
					allOrderImageKeys = new Set<string>();
					targetOrderImageKeys = new Set<string>();

					deliveredOrders.forEach((order: any) => {
						if (!order.orderId) return;
						
						// Normalize selectedKeys
						let selectedKeys: string[] = [];
						if (Array.isArray(order.selectedKeys)) {
							selectedKeys = order.selectedKeys.map((k: unknown) => String(k).trim());
						} else if (typeof order.selectedKeys === 'string') {
							try {
								const parsed = JSON.parse(order.selectedKeys);
								if (Array.isArray(parsed)) {
									selectedKeys = parsed.map((k: unknown) => String(k).trim());
								}
							} catch {
								// Invalid JSON, skip
							}
						}

						selectedKeys.forEach(key => {
							allOrderImageKeys!.add(key);
							// If filtering by specific order, track its images
							if (filterOrderId && order.orderId === filterOrderId) {
								targetOrderImageKeys!.add(key);
							}
						});
					});

					// Apply filter to sortedOriginals
					if (filterOrderId) {
						// Only include images in the specified order
						sortedOriginals = sortedOriginals.filter(item => targetOrderImageKeys!.has(item.filename));
					} else if (filterUnselected) {
						// Only include images NOT in any order
						sortedOriginals = sortedOriginals.filter(item => !allOrderImageKeys!.has(item.filename));
					}
				} catch (err: any) {
					// Log but continue - filtering is optional, we can fall back to showing all
					logger.warn('Failed to fetch orders for filtering', {
						error: err.message,
						galleryId
					});
				}
			}
		}

		// Generate WebP filename helper (replace extension with .webp)
		const getWebpFilename = (fname: string) => {
			const lastDot = fname.lastIndexOf('.');
			if (lastDot === -1) return `${fname}.webp`;
			return `${fname.substring(0, lastDot)}.webp`;
		};

		// Apply cursor-based pagination to DynamoDB results
		// Cursor format: "timestamp|filename" (e.g., "1704110400000|image.jpg")
		let paginatedOriginals = sortedOriginals;
		if (cursor) {
			// Parse cursor: extract timestamp and filename
			const parts = cursor.split('|');
			if (parts.length !== 2) {
				// Invalid cursor format - treat as no cursor (start from beginning)
				logger.warn('Invalid cursor format, expected timestamp|filename', { cursor, galleryId });
			} else {
				const cursorTimestamp = parseInt(parts[0], 10);
				const cursorFilename = parts[1];
				
				if (isNaN(cursorTimestamp) || !cursorFilename) {
					// Invalid cursor - treat as no cursor
					logger.warn('Invalid cursor values', { cursorTimestamp, cursorFilename, galleryId });
				} else {
					// Find cursor position by timestamp and filename
					const cursorIndex = sortedOriginals.findIndex(item => 
						item.filename === cursorFilename && item.lastModified === cursorTimestamp
					);
					if (cursorIndex >= 0) {
						paginatedOriginals = sortedOriginals.slice(cursorIndex + 1);
					} else if (cursorIndex === -1 && sortedOriginals.length > 0) {
						// Cursor not found, find position where it would be inserted
						// Since we're sorted descending (newest first), find first item that comes AFTER cursor
						const insertIndex = sortedOriginals.findIndex(item => {
							// Item comes after cursor if: older timestamp OR same timestamp with filename after cursor
							if (item.lastModified < cursorTimestamp) {
								return true; // Item is older (smaller timestamp) = comes after cursor in descending sort
							}
							if (item.lastModified === cursorTimestamp && item.filename > cursorFilename) {
								return true; // Same timestamp, but filename comes after cursor alphabetically
							}
							return false;
						});
						paginatedOriginals = insertIndex >= 0 ? sortedOriginals.slice(insertIndex) : [];
					}
				}
			}
		}

		// Extract keys from paginated results
		const paginatedOriginalKeys = paginatedOriginals.map(item => item.filename);

		// Apply limit + 1 to check if there are more items
		const keysToProcess = paginatedOriginalKeys.slice(0, limit + 1);
		const hasMore = keysToProcess.length > limit;
		const finalKeys = hasMore ? keysToProcess.slice(0, limit) : keysToProcess;

		// Create a map of image records for quick lookup
		const imageRecordsMap = new Map<string, typeof sortedOriginals[0]>();
		sortedOriginals.forEach(record => {
			imageRecordsMap.set(record.filename, record);
		});

		// Build images list from paginated originals only (PNG/JPEG files)
		// For each original, generate WebP preview/thumb URLs from previews/thumbs folders
		// This allows showing previews even when originals are deleted (after finals upload)
		// DynamoDB is now the source of truth for image metadata
		// Generate S3 presigned URLs as fallback for robust image loading
		const images = await Promise.all(
			finalKeys.map(async (filename: string) => {
				if (!filename) return null;
				
				// Skip WebP files in originals folder (shouldn't happen, but safety check)
				if (filename.toLowerCase().endsWith('.webp')) {
					return null;
				}
				
				// Find image record from DynamoDB
				const imageRecord = imageRecordsMap.get(filename);
				if (!imageRecord) {
					// Image record not found in DynamoDB - skip (shouldn't happen, but handle gracefully)
					return null;
				}

				const originalKey = imageRecord.s3Key || `galleries/${galleryId}/originals/${filename}`;
				
				// Generate WebP filename for this original (e.g., "image.png" -> "image.webp")
				const webpFilename = getWebpFilename(filename);
				const previewWebpKey = `galleries/${galleryId}/previews/${webpFilename}`;
				const bigThumbWebpKey = `galleries/${galleryId}/bigthumbs/${webpFilename}`;
				const thumbWebpKey = `galleries/${galleryId}/thumbs/${webpFilename}`;
				
				// Build CloudFront URLs for all requested sizes
				// No existence check needed - client-side fallback strategy handles missing files gracefully
				// If a file doesn't exist, the fallback will try S3 presigned URL, then next size, then original
				const buildCloudFrontUrl = (key: string): string | null => {
					return cloudfrontDomain
						? `https://${cloudfrontDomain}/${key.split('/').map(encodeURIComponent).join('/')}`
						: null;
				};
				
				const previewUrl = requestedSizes.has('preview') ? buildCloudFrontUrl(previewWebpKey) : null;
				const bigThumbUrl = requestedSizes.has('bigthumb') ? buildCloudFrontUrl(bigThumbWebpKey) : null;
				const thumbUrl = requestedSizes.has('thumb') ? buildCloudFrontUrl(thumbWebpKey) : null;

				// Generate S3 presigned URLs as fallback (24 hour expiry)
				// Generate for all requested sizes - client-side fallback handles missing files
				// These will be used if CloudFront returns 403/404 or fails
				let previewUrlFallback: string | null = null;
				let bigThumbUrlFallback: string | null = null;
				let thumbUrlFallback: string | null = null;
				let originalUrl: string | null = null;

				try {
					// Helper function to generate presigned URL
					const generatePresignedUrl = async (key: string): Promise<string | null> => {
						try {
							const cmd = new GetObjectCommand({
								Bucket: bucket,
								Key: key
							});
							return await getSignedUrl(s3, cmd, { expiresIn: 86400 });
						} catch (err: any) {
							// Log but don't fail - fallback URLs are optional
							// File may not exist (e.g., original deleted, thumbnails not generated yet)
							// Client-side fallback will handle this gracefully
							return null;
						}
					};

					// Generate presigned URLs in parallel for better performance
					// Generate for all requested sizes - client fallback handles missing files
					const presignedUrlPromises: Promise<void>[] = [];

					if (requestedSizes.has('preview')) {
						presignedUrlPromises.push(
							generatePresignedUrl(previewWebpKey)
								.then(url => { previewUrlFallback = url; })
						);
					}

					if (requestedSizes.has('bigthumb')) {
						presignedUrlPromises.push(
							generatePresignedUrl(bigThumbWebpKey)
								.then(url => { bigThumbUrlFallback = url; })
						);
					}

					if (requestedSizes.has('thumb')) {
						presignedUrlPromises.push(
							generatePresignedUrl(thumbWebpKey)
								.then(url => { thumbUrlFallback = url; })
						);
					}

					// Always generate presigned URL for original photo (ultimate fallback)
					// Note: original may not exist in S3 if it was deleted, but we still have metadata
					// Client-side fallback will handle missing original gracefully
						presignedUrlPromises.push(
							generatePresignedUrl(originalKey)
								.then(url => { originalUrl = url; })
						);

					// Wait for all presigned URL generations to complete
					await Promise.all(presignedUrlPromises);
				} catch (err: any) {
					// Log error but don't fail - fallback URLs are optional
					logger.warn('Failed to generate presigned URLs for fallback', {
						filename,
						error: err.message
					});
				}

				// Use size and lastModified from DynamoDB record
				const size = imageRecord.size || 0;
				const lastModified = imageRecord.lastModified 
					? new Date(imageRecord.lastModified).toISOString()
					: undefined;

				return {
					key: filename, // Original filename (PNG/JPEG)
					previewUrl,    // CloudFront WebP preview URL (1400px) from previews folder
					previewUrlFallback, // S3 presigned URL fallback for preview
					bigThumbUrl,   // CloudFront WebP big thumb URL (600px) from bigthumbs folder
					bigThumbUrlFallback, // S3 presigned URL fallback for big thumb
					thumbUrl,      // CloudFront WebP thumb URL (600px) from thumbs folder
					thumbUrlFallback, // S3 presigned URL fallback for thumb
					url: originalUrl, // S3 presigned URL for original photo (ultimate fallback, may be null if deleted)
					size,
					lastModified
				};
			})
		);

		const filteredImages = images
			.filter((item): item is NonNullable<typeof item> => item !== null);

		// Generate next cursor from last item
		// Format: "timestamp|filename" for accurate pagination with timestamp-based sorting
		let nextCursor: string | null = null;
		if (hasMore && filteredImages.length > 0) {
			const lastItem = filteredImages[filteredImages.length - 1];
			if (lastItem.key && lastItem.lastModified) {
				// Get timestamp as number (milliseconds since epoch)
				const timestamp = typeof lastItem.lastModified === 'string' 
					? new Date(lastItem.lastModified).getTime()
					: lastItem.lastModified;
				// Format: timestamp|filename
				nextCursor = encodeURIComponent(`${timestamp}|${lastItem.key}`);
			} else {
				// Fallback to old format if lastModified is missing (shouldn't happen, but for safety)
				nextCursor = encodeURIComponent(lastItem.key || '');
			}
		}

		// Check for sync issue: no images but originalsBytesUsed > 0
		// Note: Storage recalculation is now handled on-demand when needed (pay, validateUploadLimits, etc.)
		// Only check if we're on the first page (no cursor) and got no results
		if (!cursor && filteredImages.length === 0 && (gallery.originalsBytesUsed || 0) > 0) {
			logger.info('Detected sync issue: no images but originalsBytesUsed > 0', {
				galleryId,
				originalsBytesUsed: gallery.originalsBytesUsed || 0,
				dynamoDbRecordCount: allImageRecords.length
			});
			// No action needed - storage can be recalculated on-demand if needed
		}

		// Calculate statistics: total count and order-based counts
		// Use totalCountBeforeFiltering to ensure accurate stats regardless of filtering
		// When filtering is applied, sortedOriginals.length will be different, but we need the true total
		const totalCount = totalCountBeforeFiltering;
		const stats: {
			totalCount: number;
			orderCounts?: Array<{ orderId: string; count: number }>;
			unselectedCount?: number;
		} = {
			totalCount
		};

		// If orders table is available and we're on the first page, fetch order statistics
		if (ordersTable && !cursor) {
			try {
				const ordersQuery = await ddb.send(new QueryCommand({
					TableName: ordersTable,
					KeyConditionExpression: 'galleryId = :g',
					ExpressionAttributeValues: { ':g': galleryId }
				}));

				const orders = ordersQuery.Items || [];
				// Filter to delivered orders only (DELIVERED, PREPARING_DELIVERY, CLIENT_APPROVED)
				const deliveredOrders = orders.filter((o: any) => 
					o.deliveryStatus === 'DELIVERED' || 
					o.deliveryStatus === 'PREPARING_DELIVERY' || 
					o.deliveryStatus === 'CLIENT_APPROVED'
				);

				// Calculate counts per order and total images in orders
				const orderCounts: Array<{ orderId: string; count: number }> = [];
				const allOrderImageKeys = new Set<string>();

				deliveredOrders.forEach((order: any) => {
					if (!order.orderId) return;
					
					// Normalize selectedKeys - handle both array and JSON string
					let selectedKeys: string[] = [];
					if (Array.isArray(order.selectedKeys)) {
						selectedKeys = order.selectedKeys.map((k: unknown) => String(k).trim());
					} else if (typeof order.selectedKeys === 'string') {
						try {
							const parsed = JSON.parse(order.selectedKeys);
							if (Array.isArray(parsed)) {
								selectedKeys = parsed.map((k: unknown) => String(k).trim());
							}
						} catch {
							// Invalid JSON, skip
						}
					}

					const count = selectedKeys.length;
					if (count > 0) {
						orderCounts.push({
							orderId: order.orderId,
							count
						});
						selectedKeys.forEach(key => allOrderImageKeys.add(key));
					}
				});

				stats.orderCounts = orderCounts;
				stats.unselectedCount = Math.max(0, totalCount - allOrderImageKeys.size);
			} catch (err: any) {
				// Log but don't fail - stats are optional
				logger.warn('Failed to fetch order statistics', {
					error: err.message,
					galleryId
				});
			}
		}

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				images: filteredImages,
				count: filteredImages.length,
				totalCount: stats.totalCount,
				stats: stats.orderCounts || stats.unselectedCount !== undefined ? stats : undefined,
				hasMore,
				nextCursor
			})
		};
	} catch (error: any) {
		logger.error('List images failed', {
			error: {
				name: error.name,
				message: error.message,
				code: error.code,
				stack: error.stack
			},
			galleryId,
			bucket,
			hasCloudfrontDomain: !!cloudfrontDomain
		});
		return createLambdaErrorResponse(error, 'Failed to list images', 500);
	}
});

