import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';

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
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or orderId' })
		};
	}

	try {
		// Verify gallery exists
		const galleryGet = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));
		const gallery = galleryGet.Item as any;
		if (!gallery) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery not found' })
			};
		}

		// Verify access - supports both owner (Cognito) and client (JWT) tokens
		const access = verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
			};
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
				return {
					statusCode: 403,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Gallery not published',
						message: 'Final photos are not available until the gallery is published. Please contact the photographer.'
					})
				};
			}
		}

		// Verify order exists
		const orderGet = await ddb.send(new GetCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId }
		}));
		const order = orderGet.Item as any;
		if (!order) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Order not found' })
			};
		}

		// List final images for this order
		// Final images are stored at: galleries/{galleryId}/final/{orderId}/{filename}
		const prefix = `galleries/${galleryId}/final/${orderId}/`;
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			Delimiter: '/' // Only return objects directly under this prefix, not subdirectories
		}));

		const images = (listResponse.Contents || [])
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
				const getWebpKey = (originalKey: string) => {
					const lastDot = originalKey.lastIndexOf('.');
					if (lastDot === -1) return `${originalKey}.webp`;
					return `${originalKey.substring(0, lastDot)}.webp`;
				};
				
				const previewKey = `galleries/${galleryId}/final/${orderId}/previews/${filename}`;
				const bigThumbKey = `galleries/${galleryId}/final/${orderId}/bigthumbs/${filename}`;
				const thumbKey = `galleries/${galleryId}/final/${orderId}/thumbs/${filename}`;
				const previewWebpKey = getWebpKey(previewKey);
				const bigThumbWebpKey = getWebpKey(bigThumbKey);
				const thumbWebpKey = getWebpKey(thumbKey);
				
				// Build CloudFront URLs - encode path segments
				const finalUrl = cloudfrontDomain 
					? `https://${cloudfrontDomain}/${finalKey.split('/').map(encodeURIComponent).join('/')}`
					: null;
				
				// Processed WebP URLs for display (three-tier optimization)
				const previewUrl = cloudfrontDomain
					? `https://${cloudfrontDomain}/${previewWebpKey.split('/').map(encodeURIComponent).join('/')}`
					: null;
				const bigThumbUrl = cloudfrontDomain
					? `https://${cloudfrontDomain}/${bigThumbWebpKey.split('/').map(encodeURIComponent).join('/')}`
					: null;
				const thumbUrl = cloudfrontDomain
					? `https://${cloudfrontDomain}/${thumbWebpKey.split('/').map(encodeURIComponent).join('/')}`
					: null;

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

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				orderId,
				images,
				count: images.length
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
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list final images', message: error.message })
		};
	}
});

