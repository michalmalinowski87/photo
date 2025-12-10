import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const cloudfrontDomain = envProc?.env?.CLOUDFRONT_DOMAIN as string;
	
	if (!galleriesTable || !bucket) {
		logger.error('Missing required environment variables', {
			hasGalleriesTable: !!galleriesTable,
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
	const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50; // Default 50, max 100
	const cursorParam = event?.queryStringParameters?.cursor;
	let cursor: string | null = cursorParam ? decodeURIComponent(cursorParam) : null;

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
	const access = verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner && !access.isClient) {
		logger.warn('Invalid or missing authentication', { galleryId });
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	try {
		// List all image folders in parallel for optimal performance
		const originalsPrefix = `galleries/${galleryId}/originals/`;
		const previewsPrefix = `galleries/${galleryId}/previews/`;
		const bigThumbsPrefix = `galleries/${galleryId}/bigthumbs/`;
		const thumbsPrefix = `galleries/${galleryId}/thumbs/`;

		// Fetch all originals with pagination support (if many images)
		// For other folders, we need all items to match with originals
		const allOriginalsContents: any[] = [];
		let continuationToken: string | undefined = undefined;
		
		do {
			const originalsListParams: any = {
				Bucket: bucket,
				Prefix: originalsPrefix
			};
			if (continuationToken) {
				originalsListParams.ContinuationToken = continuationToken;
			}
			
			const originalsListResponse = await s3.send(new ListObjectsV2Command(originalsListParams));
			allOriginalsContents.push(...(originalsListResponse.Contents || []));
			continuationToken = originalsListResponse.NextContinuationToken;
		} while (continuationToken);

		// Fetch all other folders (we need complete lists to match)
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

		// Process originals (may be empty if already deleted after finals upload)
		const originalFiles = new Map<string, any>(
			allOriginalsContents
				.map(obj => {
					const fullKey = obj.Key || '';
					const filename = fullKey.replace(originalsPrefix, '');
					return filename ? [filename, obj] : null;
				})
				.filter((entry): entry is [string, any] => entry !== null)
		);
		const originalKeys = Array.from(originalFiles.keys()).sort(); // Sort for consistent pagination

		// Process preview images (kept even when originals are deleted, so we can show them as "Wybrane")
		const previewFiles = new Map<string, any>(
			(previewsListResponse.Contents || [])
				.map(obj => {
					const fullKey = obj.Key || '';
					const filename = fullKey.replace(previewsPrefix, '');
					return filename ? [filename, obj] : null;
				})
				.filter((entry): entry is [string, any] => entry !== null)
		);

		// Process big thumbs
		const bigThumbKeys = new Set(
			(bigThumbsListResponse.Contents || []).map(obj => {
				const fullKey = obj.Key || '';
				return fullKey.replace(bigThumbsPrefix, '');
			}).filter(Boolean)
		);

		// Process thumbnails
		const thumbKeys = new Set(
			(thumbsListResponse.Contents || []).map(obj => {
				const fullKey = obj.Key || '';
				return fullKey.replace(thumbsPrefix, '');
			}).filter(Boolean)
		);

		// Generate WebP filename helper (replace extension with .webp)
		const getWebpFilename = (fname: string) => {
			const lastDot = fname.lastIndexOf('.');
			if (lastDot === -1) return `${fname}.webp`;
			return `${fname.substring(0, lastDot)}.webp`;
		};

		// Apply cursor-based pagination (skip files before cursor)
		let paginatedOriginalKeys = originalKeys;
		if (cursor) {
			const cursorIndex = originalKeys.findIndex(key => key === cursor);
			if (cursorIndex >= 0) {
				paginatedOriginalKeys = originalKeys.slice(cursorIndex + 1);
			} else if (cursorIndex === -1 && originalKeys.length > 0) {
				// Cursor not found, find position where it would be inserted
				const insertIndex = originalKeys.findIndex(key => key > cursor);
				paginatedOriginalKeys = insertIndex >= 0 ? originalKeys.slice(insertIndex) : [];
			}
		}

		// Apply limit + 1 to check if there are more items
		const keysToProcess = paginatedOriginalKeys.slice(0, limit + 1);
		const hasMore = keysToProcess.length > limit;
		const finalKeys = hasMore ? keysToProcess.slice(0, limit) : keysToProcess;

		// Build images list from paginated originals only (PNG/JPEG files)
		// For each original, generate WebP preview/thumb URLs from previews/thumbs folders
		// This allows showing previews even when originals are deleted (after finals upload)
		// But we only list originals as the source of truth
		// Generate S3 presigned URLs as fallback for robust image loading
		const images = await Promise.all(
			finalKeys.map(async (filename: string) => {
				if (!filename) return null;
				
				// Skip WebP files in originals folder (shouldn't happen, but safety check)
				if (filename.toLowerCase().endsWith('.webp')) {
					return null;
				}
				
				const originalObj = originalFiles.get(filename);
				const originalKey = `galleries/${galleryId}/originals/${filename}`;
				
				// Generate WebP filename for this original (e.g., "image.png" -> "image.webp")
				const webpFilename = getWebpFilename(filename);
				const previewWebpKey = `galleries/${galleryId}/previews/${webpFilename}`;
				const bigThumbWebpKey = `galleries/${galleryId}/bigthumbs/${webpFilename}`;
				const thumbWebpKey = `galleries/${galleryId}/thumbs/${webpFilename}`;
				
				// Check if WebP versions exist in previews/bigthumbs/thumbs folders
				// ListObjectsV2 already confirmed existence, so no need for HEAD requests
				const hasPreviewWebp = previewFiles.has(webpFilename);
				const hasBigThumbWebp = bigThumbKeys.has(webpFilename);
				const hasThumbWebp = thumbKeys.has(webpFilename);
				
				// Build CloudFront URLs directly - no HEAD verification needed
				// ListObjectsV2 already confirmed files exist, so CloudFront URLs are valid
				const buildCloudFrontUrl = (hasFile: boolean, key: string): string | null => {
					return (hasFile && cloudfrontDomain)
						? `https://${cloudfrontDomain}/${key.split('/').map(encodeURIComponent).join('/')}`
						: null;
				};
				
				const previewUrl = buildCloudFrontUrl(hasPreviewWebp, previewWebpKey);
				const bigThumbUrl = buildCloudFrontUrl(hasBigThumbWebp, bigThumbWebpKey);
				const thumbUrl = buildCloudFrontUrl(hasThumbWebp, thumbWebpKey);

				// Generate S3 presigned URLs as fallback (24 hour expiry)
				// Only generate for requested sizes to optimize performance
				// These will be used if CloudFront returns 403 or fails
				// No HEAD verification needed - ListObjectsV2 already confirmed files exist
				let previewUrlFallback: string | null = null;
				let bigThumbUrlFallback: string | null = null;
				let thumbUrlFallback: string | null = null;
				let originalUrl: string | null = null;

				try {
					// Helper function to generate presigned URL without HEAD verification
					// ListObjectsV2 already confirmed file existence, so we can generate directly
					const generatePresignedUrl = async (key: string): Promise<string | null> => {
						try {
							const cmd = new GetObjectCommand({
								Bucket: bucket,
								Key: key
							});
							return await getSignedUrl(s3, cmd, { expiresIn: 86400 });
						} catch (err: any) {
							// Log but don't fail - fallback URLs are optional
							logger.warn('Failed to generate presigned URL', {
								key,
								error: err.message
							});
							return null;
						}
					};

					// Generate presigned URLs in parallel for better performance
					// Only generate for sizes that were found in listing AND requested
					const presignedUrlPromises: Promise<void>[] = [];

					if (hasPreviewWebp && requestedSizes.has('preview')) {
						presignedUrlPromises.push(
							generatePresignedUrl(previewWebpKey)
								.then(url => { previewUrlFallback = url; })
						);
					}

					if (hasBigThumbWebp && requestedSizes.has('bigthumb')) {
						presignedUrlPromises.push(
							generatePresignedUrl(bigThumbWebpKey)
								.then(url => { bigThumbUrlFallback = url; })
						);
					}

					if (hasThumbWebp && requestedSizes.has('thumb')) {
						presignedUrlPromises.push(
							generatePresignedUrl(thumbWebpKey)
								.then(url => { thumbUrlFallback = url; })
						);
					}

					// Always generate presigned URL for original photo (ultimate fallback)
					// This is needed for fallback even if not explicitly requested
					if (originalObj) {
						presignedUrlPromises.push(
							generatePresignedUrl(originalKey)
								.then(url => { originalUrl = url; })
						);
					}

					// Wait for all presigned URL generations to complete
					await Promise.all(presignedUrlPromises);
				} catch (err: any) {
					// Log error but don't fail - fallback URLs are optional
					logger.warn('Failed to generate presigned URLs for fallback', {
						filename,
						error: err.message
					});
				}

				// Use original size (from originals folder)
				const size = originalObj?.Size || 0;
				const lastModified = originalObj?.LastModified?.toISOString();

				return {
					key: filename, // Original filename (PNG/JPEG)
					previewUrl,    // CloudFront WebP preview URL (1400px) from previews folder
					previewUrlFallback, // S3 presigned URL fallback for preview
					bigThumbUrl,   // CloudFront WebP big thumb URL (600px) from bigthumbs folder
					bigThumbUrlFallback, // S3 presigned URL fallback for big thumb
					thumbUrl,      // CloudFront WebP thumb URL (300x300) from thumbs folder
					thumbUrlFallback, // S3 presigned URL fallback for thumb
					url: originalUrl, // S3 presigned URL for original photo (ultimate fallback)
					size,
					lastModified
				};
			})
		);

		const filteredImages = images
			.filter((item): item is NonNullable<typeof item> => item !== null);

		// Generate next cursor from last item
		let nextCursor: string | null = null;
		if (hasMore && filteredImages.length > 0) {
			const lastItem = filteredImages[filteredImages.length - 1];
			nextCursor = encodeURIComponent(lastItem.key);
		}

		// Check for sync issue: no images but originalsBytesUsed > 0
		// Note: Storage recalculation is now handled on-demand when needed (pay, validateUploadLimits, etc.)
		// Only check if we're on the first page (no cursor) and got no results
		if (!cursor && filteredImages.length === 0 && (gallery.originalsBytesUsed || 0) > 0) {
			logger.info('Detected sync issue: no images but originalsBytesUsed > 0, S3 events will handle recalculation', {
				galleryId,
				originalsBytesUsed: gallery.originalsBytesUsed || 0
			});
			// No action needed - S3 events will trigger recalculation automatically
		}

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				images: filteredImages,
				count: filteredImages.length,
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

