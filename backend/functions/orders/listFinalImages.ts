import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';
import { getConfigValueFromSsm } from '../../lib/src/ssm-config';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const stage = envProc?.env?.STAGE || 'dev';
	// Read CloudFront domain from SSM Parameter Store (avoids circular dependency in CDK)
	const cloudfrontDomain = await getConfigValueFromSsm(stage, 'CloudFrontDomain') || undefined;

	if (!bucket || !galleriesTable || !imagesTable || !ordersTable) {
		return createLambdaErrorResponse(
			new Error('Missing required environment variables'),
			'Missing required environment variables',
			500
		);
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) {
		return createLambdaErrorResponse(
			new Error('Missing galleryId or orderId'),
			'Missing galleryId or orderId',
			400
		);
	}

	// Parse pagination parameters
	const limitParam = event?.queryStringParameters?.limit;
	const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50; // Default 50, max 100
	const cursorParam = event?.queryStringParameters?.cursor;
	const cursor: string | null = cursorParam ? decodeURIComponent(cursorParam) : null;

	try {
		// OPTIMIZATION: Fetch gallery and order in parallel (they're independent)
		const [galleryResult, orderResult] = await Promise.all([
			ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			})),
			ddb.send(new GetCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId }
			}))
		]);

		const gallery = galleryResult.Item as any;
		if (!gallery) {
			return createLambdaErrorResponse(
				new Error('Gallery not found'),
				'Gallery not found',
				404
			);
		}

		const order = orderResult.Item as any;
		if (!order) {
			return createLambdaErrorResponse(
				new Error('Order not found'),
				'Order not found',
				404
			);
		}

		// Verify access - supports both owner (Cognito) and client (JWT) tokens
		const access = await verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return createLambdaErrorResponse(
				new Error('Unauthorized'),
				'Unauthorized. Please log in.',
				401
			);
		}

		// For client access, check if gallery is paid before allowing access to finals
		// Owners can always access finals (even for unpublished galleries)
		if (access.isClient) {
			let isPaid = false;
			try {
				const paidTransaction = await getPaidTransactionForGallery(galleryId);
				isPaid = !!paidTransaction;
			} catch (err) {
				// If transaction check fails, fall back to gallery state
				isPaid = gallery.state === 'PAID_ACTIVE';
			}

			if (!isPaid) {
				return createLambdaErrorResponse(
					new Error('Gallery not published'),
					'Gallery not published',
					403
				);
			}
		}

		// Query DynamoDB for final images instead of S3 listing
		// Query using galleryId PK and filter by type = 'final' and orderId
		const previewsPrefix = `galleries/${galleryId}/final/${orderId}/previews/`;
		const bigThumbsPrefix = `galleries/${galleryId}/final/${orderId}/bigthumbs/`;
		const thumbsPrefix = `galleries/${galleryId}/final/${orderId}/thumbs/`;

		// Query DynamoDB for final images for this order
		let allFinalImageRecords: any[] = [];
		let lastEvaluatedKey: any = undefined;

		do {
			const queryParams: any = {
				TableName: imagesTable,
				IndexName: 'galleryId-orderId-index', // Use GSI for efficient querying by orderId
				KeyConditionExpression: 'galleryId = :g AND orderId = :orderId',
				FilterExpression: '#type = :type', // Filter by type (GSI is sparse, but filter for safety)
				ExpressionAttributeNames: {
					'#type': 'type'
				},
				ExpressionAttributeValues: {
					':g': galleryId,
					':orderId': orderId,
					':type': 'final'
				},
				Limit: 1000 // DynamoDB query limit
			};

			if (lastEvaluatedKey) {
				queryParams.ExclusiveStartKey = lastEvaluatedKey;
			}

			const queryResponse = await ddb.send(new QueryCommand(queryParams));
			allFinalImageRecords.push(...(queryResponse.Items || []));
			lastEvaluatedKey = queryResponse.LastEvaluatedKey;
		} while (lastEvaluatedKey);

		// Fetch preview/thumb folders to check existence (still use S3 listing for these)
		const [previewsListResponse, bigThumbsListResponse, thumbsListResponse] = await Promise.all([
			s3.send(new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: previewsPrefix
			})),
			s3.send(new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: bigThumbsPrefix
			})),
			s3.send(new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: thumbsPrefix
			}))
		]);

		// Helper to extract base filename (without extension) for matching
		// S3 keys are stored as IMG_4723.webp, DynamoDB has IMG_4723.jpg
		// We need to match on base name (IMG_4723) regardless of extension
		const getBaseFilename = (filename: string): string => {
			const lastDot = filename.lastIndexOf('.');
			return lastDot === -1 ? filename : filename.substring(0, lastDot);
		};

		// Process preview images (for matching with finals)
		// Extract base filename (without .webp extension) for matching
		const previewFiles = new Map<string, any>(
			(previewsListResponse.Contents || [])
				.map(obj => {
					const fullKey = obj.Key || '';
					const filenameWithExt = fullKey.replace(previewsPrefix, '').replace('.webp', '');
					const baseFilename = getBaseFilename(filenameWithExt);
					return baseFilename ? [baseFilename, obj] : null;
				})
				.filter((entry): entry is [string, any] => entry !== null)
		);

		// Process big thumbs
		const bigThumbKeys = new Set(
			(bigThumbsListResponse.Contents || []).map(obj => {
				const fullKey = obj.Key || '';
				const filenameWithExt = fullKey.replace(bigThumbsPrefix, '').replace('.webp', '');
				return getBaseFilename(filenameWithExt);
			}).filter(Boolean)
		);

		// Process thumbnails
		const thumbKeys = new Set(
			(thumbsListResponse.Contents || []).map(obj => {
				const fullKey = obj.Key || '';
				const filenameWithExt = fullKey.replace(thumbsPrefix, '').replace('.webp', '');
				return getBaseFilename(filenameWithExt);
			}).filter(Boolean)
		);

		// Sort final images by lastModified (newest first), with filename as secondary sort key
		const sortedFinalFiles = allFinalImageRecords
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
		
		// Total size of all final files (bytes) - used for ZIP ETA estimates in the client.
		// Note: sizes come from DynamoDB metadata written on upload.
		const totalBytes = sortedFinalFiles.reduce((sum, f) => sum + (f.size || 0), 0);

		// Generate WebP filename helper (replace extension with .webp)
		const getWebpFilename = (fname: string) => {
			const lastDot = fname.lastIndexOf('.');
			if (lastDot === -1) return `${fname}.webp`;
			return `${fname.substring(0, lastDot)}.webp`;
		};

		// Build images array from DynamoDB records with fallback URLs
		const allImages = await Promise.all(
			sortedFinalFiles.map(async (record) => {
				const filename = record.filename;
				const finalKey = record.s3Key || `galleries/${galleryId}/final/${orderId}/${filename}`;
				
				// Generate WebP preview/thumb keys (for display)
				const previewKey = `galleries/${galleryId}/final/${orderId}/previews/${filename}`;
				const bigThumbKey = `galleries/${galleryId}/final/${orderId}/bigthumbs/${filename}`;
				const thumbKey = `galleries/${galleryId}/final/${orderId}/thumbs/${filename}`;
				const previewWebpKey = getWebpFilename(previewKey);
				const bigThumbWebpKey = getWebpFilename(bigThumbKey);
				const thumbWebpKey = getWebpFilename(thumbKey);
				
				// Check if WebP versions exist by matching base filename (without extension)
				// DynamoDB filename might be IMG_4723.jpg, S3 keys are IMG_4723.webp
				const baseFilename = getBaseFilename(filename);
				const hasPreviewWebp = previewFiles.has(baseFilename);
				const hasBigThumbWebp = bigThumbKeys.has(baseFilename);
				const hasThumbWebp = thumbKeys.has(baseFilename);
				
				// Build CloudFront URLs - encode path segments
				const buildCloudFrontUrl = (hasFile: boolean, key: string): string | null => {
					return (hasFile && cloudfrontDomain)
						? `https://${cloudfrontDomain}/${key.split('/').map(encodeURIComponent).join('/')}`
						: null;
				};
				
				const finalUrl = cloudfrontDomain 
					? `https://${cloudfrontDomain}/${finalKey.split('/').map(encodeURIComponent).join('/')}`
					: null;
				
				// Always generate CloudFront URLs for all sizes (client-side fallback handles missing files)
				// This ensures consistency - URLs are always present, even if files don't exist yet
				const previewUrl = buildCloudFrontUrl(true, previewWebpKey);
				const bigThumbUrl = buildCloudFrontUrl(true, bigThumbWebpKey);
				const thumbUrl = buildCloudFrontUrl(true, thumbWebpKey);

				// When CloudFront is configured, skip S3 presigned URLs in list response for speed.
				// Client requests presigned URL per image only when CloudFront fails (e.g. on-demand endpoint).
				let previewUrlFallback: string | null = null;
				let bigThumbUrlFallback: string | null = null;
				let thumbUrlFallback: string | null = null;
				let finalUrlFallback: string | null = null;

				if (!cloudfrontDomain) {
					try {
						const generatePresignedUrl = async (key: string): Promise<string | null> => {
							try {
								const cmd = new GetObjectCommand({
									Bucket: bucket,
									Key: key
								});
								return await getSignedUrl(s3, cmd, { expiresIn: 86400 });
							} catch (err: any) {
								return null;
							}
						};

						const presignedUrlPromises: Promise<void>[] = [
							generatePresignedUrl(previewWebpKey).then(url => { previewUrlFallback = url; }),
							generatePresignedUrl(bigThumbWebpKey).then(url => { bigThumbUrlFallback = url; }),
							generatePresignedUrl(thumbWebpKey).then(url => { thumbUrlFallback = url; }),
							generatePresignedUrl(finalKey).then(url => { finalUrlFallback = url; })
						];
						await Promise.all(presignedUrlPromises);
					} catch (err: any) {
						logger.warn('Failed to generate presigned URLs for fallback', {
							filename,
							error: err.message
						});
					}
				}

				return {
					key: filename,
					finalUrl, // CloudFront URL for original final image
					finalUrlFallback, // S3 presigned URL fallback for final image
					previewUrl, // CloudFront WebP preview (1400px) for full-screen viewing
					previewUrlFallback, // S3 presigned URL fallback for preview
					bigThumbUrl, // CloudFront WebP big thumb (600px) for masonry grid
					bigThumbUrlFallback, // S3 presigned URL fallback for big thumb
					thumbUrl, // CloudFront WebP thumbnail (600px) for CMS grid
					thumbUrlFallback, // S3 presigned URL fallback for thumb
					size: record.size || 0,
					lastModified: record.lastModified 
						? new Date(record.lastModified).toISOString()
						: undefined
				};
			})
		);

		// Calculate total count (before pagination)
		const totalCount = allImages.length;

		// Apply cursor-based pagination (skip files before cursor)
		// Cursor format: "timestamp|filename" (e.g., "1704110400000|image.jpg")
		let paginatedImages = allImages;
		if (cursor) {
			// Parse cursor: extract timestamp and filename
			const parts = cursor.split('|');
			if (parts.length !== 2) {
				// Invalid cursor format - treat as no cursor (start from beginning)
				logger.warn('Invalid cursor format, expected timestamp|filename', { cursor, galleryId, orderId });
			} else {
				const cursorTimestamp = parseInt(parts[0], 10);
				const cursorFilename = parts[1];
				
				if (isNaN(cursorTimestamp) || !cursorFilename) {
					// Invalid cursor - treat as no cursor
					logger.warn('Invalid cursor values', { cursorTimestamp, cursorFilename, galleryId, orderId });
				} else {
					// Find cursor position by timestamp and filename in sortedFinalFiles
					const cursorIndex = sortedFinalFiles.findIndex(item => 
						item.filename === cursorFilename && item.lastModified === cursorTimestamp
					);
					if (cursorIndex >= 0) {
						paginatedImages = allImages.slice(cursorIndex + 1);
					} else if (cursorIndex === -1 && sortedFinalFiles.length > 0) {
						// Cursor not found, find position where it would be inserted
						// Since we're sorted descending (newest first), find first item that comes AFTER cursor
						const insertIndex = sortedFinalFiles.findIndex(item => {
							// Item comes after cursor if: older timestamp OR same timestamp with filename after cursor
							if (item.lastModified < cursorTimestamp) {
								return true; // Item is older (smaller timestamp) = comes after cursor in descending sort
							}
							if (item.lastModified === cursorTimestamp && item.filename > cursorFilename) {
								return true; // Same timestamp, but filename comes after cursor alphabetically
							}
							return false;
						});
						paginatedImages = insertIndex >= 0 ? allImages.slice(insertIndex) : [];
					}
				}
			}
		}

		// Apply limit + 1 to check if there are more items
		const keysToProcess = paginatedImages.slice(0, limit + 1);
		const hasMore = keysToProcess.length > limit;
		const finalImages = hasMore ? keysToProcess.slice(0, limit) : keysToProcess;

		// Generate next cursor from last item
		// Format: "timestamp|filename" for accurate pagination with timestamp-based sorting
		let nextCursor: string | null = null;
		if (hasMore && finalImages.length > 0) {
			const lastItem = finalImages[finalImages.length - 1];
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

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				orderId,
				images: finalImages,
				count: finalImages.length,
				totalCount,
				totalBytes,
				hasMore,
				nextCursor
			})
		};
	} catch (error: any) {
		logger.error('List final images for order failed', {
			error: {
				name: error.name,
				message: error.message,
				code: error.code,
				stack: error.stack
			},
			galleryId,
			orderId,
			bucket
		});
		return createLambdaErrorResponse(error, 'Failed to list final images', 500);
	}
});

