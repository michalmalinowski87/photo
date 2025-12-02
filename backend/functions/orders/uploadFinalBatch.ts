import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface BatchFileRequest {
	key: string;
	contentType?: string;
	fileSize?: number; // Optional for finals
	// Optional: Request presigned URLs for thumbnails/previews (for client-side generation)
	includeThumbnails?: boolean; // If true, also generate presigned URLs for preview and thumbnail
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;

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

	const body = event?.body ? JSON.parse(event.body) : {};
	const files: BatchFileRequest[] = body?.files || [];

	if (!Array.isArray(files) || files.length === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'files array is required' })
		};
	}

	// Limit batch size to prevent abuse (max 50 files per request)
	if (files.length > 50) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Batch size too large', message: 'Maximum 50 files per batch request' })
		};
	}

	// Enforce owner-only upload
	const requester = getUserIdFromEvent(event);
	const galleryGet = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}
	requireOwnerOr403(gallery.ownerId, requester);

	// Check if gallery is paid
	const paidTransaction = await getPaidTransactionForGallery(galleryId, ordersTable);
	if (!paidTransaction) {
		return {
			statusCode: 402,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not paid', message: 'Gallery must be paid before uploading final photos' })
		};
	}

	// Get order
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

	// Check order status - only allow uploads for certain statuses
	const blockedStatuses = ['CANCELLED'];
	if (blockedStatuses.includes(order.deliveryStatus || '')) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Order status does not allow uploads',
				message: `Cannot upload final photos for order with status: ${order.deliveryStatus}` 
			})
		};
	}

	// Check finals storage limit if fileSize is provided
	if (gallery.finalsLimitBytes) {
		const totalFileSize = files.reduce((sum, f) => sum + (f.fileSize || 0), 0);
		if (totalFileSize > 0) {
			const currentFinalsSize = gallery.finalsBytesUsed || 0;
			if (currentFinalsSize + totalFileSize > gallery.finalsLimitBytes) {
				const usedMB = (currentFinalsSize / (1024 * 1024)).toFixed(2);
				const limitMB = (gallery.finalsLimitBytes / (1024 * 1024)).toFixed(2);
				const batchMB = (totalFileSize / (1024 * 1024)).toFixed(2);
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Finals storage limit exceeded',
						message: `Finals storage limit reached. Used: ${usedMB} MB / ${limitMB} MB. Batch size: ${batchMB} MB. Please delete some final photos or upgrade your plan.`
					})
				};
			}
		}
	}

	// Generate presigned URLs for all files in parallel
	const presignedUrls = await Promise.all(
		files.map(async (file) => {
			// Key format: galleries/{galleryId}/final/{orderId}/{filename}
			const objectKey = `galleries/${galleryId}/final/${orderId}/${file.key}`;
			const cmd = new PutObjectCommand({
				Bucket: bucket,
				Key: objectKey,
				ContentType: file.contentType || 'application/octet-stream'
			});
			const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
			
			const result: {
				key: string;
				url: string;
				objectKey: string;
				expiresInSeconds: number;
				previewUrl?: string;
				previewKey?: string;
				thumbnailUrl?: string;
				thumbnailKey?: string;
			} = {
				key: file.key,
				url,
				objectKey,
				expiresInSeconds: 3600
			};

			// If client-side thumbnail generation is requested, also generate presigned URLs for preview and thumbnail
			if (file.includeThumbnails) {
				// For finals: final/{orderId}/{filename}
				const filename = file.key;
				
				// Convert to WebP filenames
				const getWebpKey = (originalKey: string) => {
					const lastDot = originalKey.lastIndexOf('.');
					if (lastDot === -1) return `${originalKey}.webp`;
					return `${originalKey.substring(0, lastDot)}.webp`;
				};
				
				const previewKey = `galleries/${galleryId}/final/${orderId}/previews/${getWebpKey(filename)}`;
				const thumbKey = `galleries/${galleryId}/final/${orderId}/thumbs/${getWebpKey(filename)}`;
				
				// Generate presigned URLs for preview and thumbnail
				const [previewUrl, thumbUrl] = await Promise.all([
					getSignedUrl(s3, new PutObjectCommand({
						Bucket: bucket,
						Key: previewKey,
						ContentType: 'image/webp',
						CacheControl: 'max-age=31536000'
					}), { expiresIn: 3600 }),
					getSignedUrl(s3, new PutObjectCommand({
						Bucket: bucket,
						Key: thumbKey,
						ContentType: 'image/webp',
						CacheControl: 'max-age=31536000'
					}), { expiresIn: 3600 })
				]);
				
				result.previewUrl = previewUrl;
				result.previewKey = previewKey.replace(`galleries/${galleryId}/`, '');
				result.thumbnailUrl = thumbUrl;
				result.thumbnailKey = thumbKey.replace(`galleries/${galleryId}/`, '');
			}
			
			return result;
		})
	);

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			urls: presignedUrls,
			count: presignedUrls.length
		})
	};
});

