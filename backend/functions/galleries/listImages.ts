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

		// Build images list from both originals AND previews
		// This allows showing previews even when originals are deleted (after finals upload)
		// Combine keys from both originals and previews to ensure we show all available images
		const allImageKeys = new Set([...originalKeys, ...previewKeys]);
		
		const images = Array.from(allImageKeys)
			.map((filename: string) => {
				if (!filename) return null;
				
				const originalObj = originalFiles.get(filename);
				const previewObj = previewFiles.get(filename);
				
				// Build preview and thumb URLs if they exist
				const previewKey = `galleries/${galleryId}/previews/${filename}`;
				const thumbKey = `galleries/${galleryId}/thumbs/${filename}`;
				
				// Generate WebP filenames (replace extension with .webp)
				const getWebpFilename = (fname: string) => {
					const lastDot = fname.lastIndexOf('.');
					if (lastDot === -1) return `${fname}.webp`;
					return `${fname.substring(0, lastDot)}.webp`;
				};
				const webpFilename = getWebpFilename(filename);
				const previewWebpKey = `galleries/${galleryId}/previews/${webpFilename}`;
				const thumbWebpKey = `galleries/${galleryId}/thumbs/${webpFilename}`;
				
				// Check if WebP versions exist
				const hasPreviewWebp = previewFiles.has(webpFilename);
				const hasThumbWebp = thumbKeys.has(webpFilename);
				
				// Build CloudFront URLs - encode path segments
				// Prefer WebP URLs when available (smaller file size)
				const previewUrl = previewKeys.has(filename) && cloudfrontDomain
					? `https://${cloudfrontDomain}/${(hasPreviewWebp ? previewWebpKey : previewKey).split('/').map(encodeURIComponent).join('/')}`
					: null;
				const previewUrlFallback = previewKeys.has(filename) && cloudfrontDomain && hasPreviewWebp
					? `https://${cloudfrontDomain}/${previewKey.split('/').map(encodeURIComponent).join('/')}`
					: null;
				const thumbUrl = thumbKeys.has(filename) && cloudfrontDomain
					? `https://${cloudfrontDomain}/${(hasThumbWebp ? thumbWebpKey : thumbKey).split('/').map(encodeURIComponent).join('/')}`
					: null;
				const thumbUrlFallback = thumbKeys.has(filename) && cloudfrontDomain && hasThumbWebp
					? `https://${cloudfrontDomain}/${thumbKey.split('/').map(encodeURIComponent).join('/')}`
					: null;

				// Use original size if available, otherwise use preview size, otherwise 0
				const size = originalObj?.Size || previewObj?.Size || 0;
				const lastModified = originalObj?.LastModified?.toISOString() || previewObj?.LastModified?.toISOString();

				return {
					key: filename,
					previewUrl,
					previewUrlFallback,
					thumbUrl,
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
		// Trigger automatic recalculation if detected (debounced internally)
		if (images.length === 0 && (gallery.originalsBytesUsed || 0) > 0) {
			logger.info('Detected sync issue: no images but originalsBytesUsed > 0, triggering automatic recalculation', {
				galleryId,
				originalsBytesUsed: gallery.originalsBytesUsed || 0
			});
			
			// Trigger recalculation asynchronously (fire and forget to avoid blocking response)
			(async () => {
				try {
					const { recalculateBytesUsedInternal } = await import('./recalculateBytesUsed');
					// Check debounce before calling (5 minute debounce)
					const now = Date.now();
					const lastRecalculatedAt = gallery.lastBytesUsedRecalculatedAt 
						? new Date(gallery.lastBytesUsedRecalculatedAt).getTime() 
						: 0;
					const RECALCULATE_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes
					
					if (now - lastRecalculatedAt >= RECALCULATE_DEBOUNCE_MS) {
						await recalculateBytesUsedInternal(galleryId, galleriesTable, bucket, gallery, logger);
					} else {
						logger.info('Automatic recalculation skipped (debounced)', {
							galleryId,
							timeSinceLastRecalculation: now - lastRecalculatedAt
						});
					}
				} catch (recalcErr: any) {
					// Log but don't fail image listing if recalculation fails
					logger.warn('Automatic recalculation failed', {
						error: recalcErr?.message,
						galleryId
					});
				}
			})();
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

