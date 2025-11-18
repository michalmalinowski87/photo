import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getJWTFromEvent } from '../../lib/src/jwt';

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

	// Verify JWT token
	const jwtPayload = getJWTFromEvent(event);
	if (!jwtPayload || jwtPayload.galleryId !== galleryId) {
		logger.warn('Invalid or missing JWT token', { galleryId });
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
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

	try {
		// Check if there are final images - if so, exclude processed photos from listing
		const finalPrefix = `galleries/${galleryId}/final/`;
		const finalListResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: finalPrefix
		}));
		const processedKeys = new Set(
			(finalListResponse.Contents || []).map(obj => {
				const fullKey = obj.Key || '';
				// Extract filename from final path (e.g., "galleries/gal_123/final/orderId/image.jpg" -> "image.jpg")
				const parts = fullKey.replace(finalPrefix, '').split('/');
				return parts.length > 1 ? parts[parts.length - 1] : fullKey.replace(finalPrefix, '');
			}).filter(Boolean)
		);

		// List preview images from S3
		const prefix = `galleries/${galleryId}/previews/`;
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix
		}));

		// Also list originals to verify they exist (only show images that have originals)
		const originalsPrefix = `galleries/${galleryId}/originals/`;
		const originalsListResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: originalsPrefix
		}));
		const originalKeys = new Set(
			(originalsListResponse.Contents || []).map(obj => {
				const fullKey = obj.Key || '';
				return fullKey.replace(originalsPrefix, '');
			}).filter(Boolean)
		);

		const images = (listResponse.Contents || [])
			.map(obj => {
				const fullKey = obj.Key || '';
				// Extract filename from key (e.g., "galleries/gal_123/previews/image.jpg" -> "image.jpg")
				const filename = fullKey.replace(prefix, '');
				if (!filename) return null;
				
				// Exclude processed photos (those that exist in final/)
				if (processedKeys.has(filename)) {
					return null;
				}
				
				// Only include images that have originals (for purchase more - originals are removed when delivered)
				if (!originalKeys.has(filename)) {
					return null;
				}
				
				const previewKey = `galleries/${galleryId}/previews/${filename}`;
				const thumbKey = `galleries/${galleryId}/thumbs/${filename}`;
				
				// Build CloudFront URLs - encode path segments
				const previewUrl = cloudfrontDomain 
					? `https://${cloudfrontDomain}/${previewKey.split('/').map(encodeURIComponent).join('/')}`
					: null;
				const thumbUrl = cloudfrontDomain
					? `https://${cloudfrontDomain}/${thumbKey.split('/').map(encodeURIComponent).join('/')}`
					: null;

				return {
					key: filename,
					previewUrl,
					thumbUrl,
					size: obj.Size || 0,
					lastModified: obj.LastModified?.toISOString()
				};
			})
			.filter(Boolean)
			.sort((a, b) => {
				// Sort by filename for consistent ordering
				return (a?.key || '').localeCompare(b?.key || '');
			});

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

