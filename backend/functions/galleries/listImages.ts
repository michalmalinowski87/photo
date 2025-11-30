import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';

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
		// List originals from S3 (may be empty if already deleted after finals upload)
		const originalsPrefix = `galleries/${galleryId}/originals/`;
		const originalsListResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: originalsPrefix
		}));
		const originalFiles = new Map<string, any>(
			(originalsListResponse.Contents || [])
				.map(obj => {
					const fullKey = obj.Key || '';
					const filename = fullKey.replace(originalsPrefix, '');
					return filename ? [filename, obj] : null;
				})
				.filter((entry): entry is [string, any] => entry !== null)
		);
		const originalKeys = new Set(originalFiles.keys());

		// List preview images from S3 (to build URLs)
		// Previews are kept even when originals are deleted, so we can show them as "Wybrane"
		const previewsPrefix = `galleries/${galleryId}/previews/`;
		const previewsListResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: previewsPrefix
		}));
		const previewFiles = new Map<string, any>(
			(previewsListResponse.Contents || [])
				.map(obj => {
					const fullKey = obj.Key || '';
					const filename = fullKey.replace(previewsPrefix, '');
					return filename ? [filename, obj] : null;
				})
				.filter((entry): entry is [string, any] => entry !== null)
		);
		const previewKeys = new Set(previewFiles.keys());

		// List thumbnails from S3
		const thumbsPrefix = `galleries/${galleryId}/thumbs/`;
		const thumbsListResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: thumbsPrefix
		}));
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

		// Build images list from originals only (PNG/JPEG files)
		// For each original, generate WebP preview/thumb URLs from previews/thumbs folders
		// This allows showing previews even when originals are deleted (after finals upload)
		// But we only list originals as the source of truth
		const images = Array.from(originalKeys)
			.map((filename: string) => {
				if (!filename) return null;
				
				// Skip WebP files in originals folder (shouldn't happen, but safety check)
				if (filename.toLowerCase().endsWith('.webp')) {
					return null;
				}
				
				const originalObj = originalFiles.get(filename);
				
				// Generate WebP filename for this original (e.g., "image.png" -> "image.webp")
				const webpFilename = getWebpFilename(filename);
				const previewWebpKey = `galleries/${galleryId}/previews/${webpFilename}`;
				const thumbWebpKey = `galleries/${galleryId}/thumbs/${webpFilename}`;
				
				// Check if WebP versions exist in previews/thumbs folders
				const hasPreviewWebp = previewFiles.has(webpFilename);
				const hasThumbWebp = thumbKeys.has(webpFilename);
				
				// Build CloudFront URLs - encode path segments
				// Only return WebP URLs from previews/thumbs folders (no fallback)
				const previewUrl = hasPreviewWebp && cloudfrontDomain
					? `https://${cloudfrontDomain}/${previewWebpKey.split('/').map(encodeURIComponent).join('/')}`
					: null;
				const previewUrlFallback = null; // No fallback, WebP only
				const thumbUrl = hasThumbWebp && cloudfrontDomain
					? `https://${cloudfrontDomain}/${thumbWebpKey.split('/').map(encodeURIComponent).join('/')}`
					: null;
				const thumbUrlFallback = null; // No fallback, WebP only

				// Use original size (from originals folder)
				const size = originalObj?.Size || 0;
				const lastModified = originalObj?.LastModified?.toISOString();

				return {
					key: filename, // Original filename (PNG/JPEG)
					previewUrl,    // WebP preview URL from previews folder
					previewUrlFallback,
					thumbUrl,      // WebP thumb URL from thumbs folder
					thumbUrlFallback,
					size,
					lastModified
				};
			})
			.filter((item): item is { key: string; previewUrl: string | null; thumbUrl: string | null; size: number; lastModified: string | undefined } => item !== null)
			.sort((a, b) => {
				// Sort by filename for consistent ordering
				return a.key.localeCompare(b.key);
			});

		// Check for sync issue: no images but originalsBytesUsed > 0
		// Note: Storage recalculation is now handled automatically by S3 events (onS3StorageChange Lambda)
		if (images.length === 0 && (gallery.originalsBytesUsed || 0) > 0) {
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
				images,
				count: images.length
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
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list images', message: error.message })
		};
	}
});

