import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const cloudfrontDomain = envProc?.env?.CLOUDFRONT_DOMAIN as string;

	if (!bucket || !galleriesTable || !ordersTable) {
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
		const access = verifyGalleryAccess(event, galleryId, gallery);
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

		// OPTIMIZATION: List final images and previews/thumbs in parallel
		// Final images are stored at: galleries/{galleryId}/final/{orderId}/{filename}
		const prefix = `galleries/${galleryId}/final/${orderId}/`;
		const previewsPrefix = `galleries/${galleryId}/final/${orderId}/previews/`;
		const bigThumbsPrefix = `galleries/${galleryId}/final/${orderId}/bigthumbs/`;
		const thumbsPrefix = `galleries/${galleryId}/final/${orderId}/thumbs/`;

		// Fetch all folders in parallel for optimal performance
		const [finalsListResponse, previewsListResponse, bigThumbsListResponse, thumbsListResponse] = await Promise.all([
			s3.send(new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix,
				Delimiter: '/' // Only return objects directly under this prefix, not subdirectories
			})),
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

		// Process preview images (for matching with finals)
		const previewFiles = new Map<string, any>(
			(previewsListResponse.Contents || [])
				.map(obj => {
					const fullKey = obj.Key || '';
					const filename = fullKey.replace(previewsPrefix, '').replace('.webp', '');
					return filename ? [filename, obj] : null;
				})
				.filter((entry): entry is [string, any] => entry !== null)
		);

		// Process big thumbs
		const bigThumbKeys = new Set(
			(bigThumbsListResponse.Contents || []).map(obj => {
				const fullKey = obj.Key || '';
				return fullKey.replace(bigThumbsPrefix, '').replace('.webp', '');
			}).filter(Boolean)
		);

		// Process thumbnails
		const thumbKeys = new Set(
			(thumbsListResponse.Contents || []).map(obj => {
				const fullKey = obj.Key || '';
				return fullKey.replace(thumbsPrefix, '').replace('.webp', '');
			}).filter(Boolean)
		);

		// Generate WebP filename helper (replace extension with .webp)
		const getWebpFilename = (fname: string) => {
			const lastDot = fname.lastIndexOf('.');
			if (lastDot === -1) return `${fname}.webp`;
			return `${fname.substring(0, lastDot)}.webp`;
		};

		// Process final images
		const allImages = (finalsListResponse.Contents || [])
			.map(obj => {
				const fullKey = obj.Key || '';
				// Ensure the key matches our expected prefix exactly
				if (!fullKey.startsWith(prefix)) {
					return null;
				}
				const filename = fullKey.replace(prefix, '');
				// Skip if empty or contains slashes (subdirectories) - skip processed previews/thumbs
				if (!filename || filename.includes('/') || filename.startsWith('previews/') || filename.startsWith('thumbs/')) {
					return null;
				}
				
				const finalKey = `galleries/${galleryId}/final/${orderId}/${filename}`;
				
				// Generate WebP preview/thumb keys (for display)
				const previewKey = `galleries/${galleryId}/final/${orderId}/previews/${filename}`;
				const bigThumbKey = `galleries/${galleryId}/final/${orderId}/bigthumbs/${filename}`;
				const thumbKey = `galleries/${galleryId}/final/${orderId}/thumbs/${filename}`;
				const previewWebpKey = getWebpFilename(previewKey);
				const bigThumbWebpKey = getWebpFilename(bigThumbKey);
				const thumbWebpKey = getWebpFilename(thumbKey);
				
				// Check if WebP versions exist
				const hasPreviewWebp = previewFiles.has(filename);
				const hasBigThumbWebp = bigThumbKeys.has(filename);
				const hasThumbWebp = thumbKeys.has(filename);
				
				// Build CloudFront URLs - encode path segments
				const buildCloudFrontUrl = (hasFile: boolean, key: string): string | null => {
					return (hasFile && cloudfrontDomain)
						? `https://${cloudfrontDomain}/${key.split('/').map(encodeURIComponent).join('/')}`
						: null;
				};
				
				const finalUrl = cloudfrontDomain 
					? `https://${cloudfrontDomain}/${finalKey.split('/').map(encodeURIComponent).join('/')}`
					: null;
				
				// Processed WebP URLs for display (three-tier optimization)
				const previewUrl = buildCloudFrontUrl(hasPreviewWebp, previewWebpKey);
				const bigThumbUrl = buildCloudFrontUrl(hasBigThumbWebp, bigThumbWebpKey);
				const thumbUrl = buildCloudFrontUrl(hasThumbWebp, thumbWebpKey);

				return {
					key: filename,
					finalUrl, // Original unprocessed URL (for download)
					previewUrl, // Processed WebP preview (1400px) for full-screen viewing
					bigThumbUrl, // Processed WebP big thumb (600px) for masonry grid
					thumbUrl, // Processed WebP thumbnail (300x300) for CMS grid
					size: obj.Size || 0,
					lastModified: obj.LastModified?.toISOString()
				};
			})
			.filter(Boolean)
			.sort((a, b) => {
				return (a?.key || '').localeCompare(b?.key || '');
			});

		// Calculate total count (before pagination)
		const totalCount = allImages.length;

		// Apply cursor-based pagination (skip files before cursor)
		let paginatedImages = allImages;
		if (cursor) {
			const cursorIndex = allImages.findIndex(img => img?.key === cursor);
			if (cursorIndex >= 0) {
				paginatedImages = allImages.slice(cursorIndex + 1);
			} else if (cursorIndex === -1 && allImages.length > 0) {
				// Cursor not found, find position where it would be inserted
				const insertIndex = allImages.findIndex(img => (img?.key || '') > cursor);
				paginatedImages = insertIndex >= 0 ? allImages.slice(insertIndex) : [];
			}
		}

		// Apply limit + 1 to check if there are more items
		const keysToProcess = paginatedImages.slice(0, limit + 1);
		const hasMore = keysToProcess.length > limit;
		const finalImages = hasMore ? keysToProcess.slice(0, limit) : keysToProcess;

		// Generate next cursor from last item
		let nextCursor: string | null = null;
		if (hasMore && finalImages.length > 0) {
			const lastItem = finalImages[finalImages.length - 1];
			if (lastItem && lastItem.key) {
				nextCursor = encodeURIComponent(lastItem.key);
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

