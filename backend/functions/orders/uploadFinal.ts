import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
	const key = body?.key;
	const contentType = body?.contentType || 'application/octet-stream';
	const fileSize = body?.fileSize; // Optional file size in bytes

	if (!key) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'key is required' })
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

	// Check if gallery is paid (not DRAFT state)
	// For non-selective galleries, allow uploads even if not paid
	// For selective galleries, require payment
	const isNonSelectionGallery = gallery.selectionEnabled === false;
	let isPaid = false;
	try {
		const paidTransaction = await getPaidTransactionForGallery(galleryId);
		isPaid = !!paidTransaction;
	} catch (err) {
		// If transaction check fails, fall back to gallery state
		isPaid = gallery.state === 'PAID_ACTIVE';
	}

	// Only require payment for selective galleries
	if (!isNonSelectionGallery && !isPaid) {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Gallery not paid',
				message: 'Cannot upload final photos. Gallery must be paid before uploading final photos. Please pay for the gallery to continue.'
			})
		};
	}

	// Verify order exists and has CLIENT_APPROVED status
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
	if (order.deliveryStatus !== 'CLIENT_APPROVED' && order.deliveryStatus !== 'PREPARING_DELIVERY' && order.deliveryStatus !== 'AWAITING_FINAL_PHOTOS') {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: `Order must have deliveryStatus CLIENT_APPROVED, PREPARING_DELIVERY, or AWAITING_FINAL_PHOTOS, got ${order.deliveryStatus}` })
		};
	}

	// Check finals storage limit if fileSize is provided
	if (fileSize !== undefined && fileSize !== null && gallery.finalsLimitBytes) {
		const currentFinalsSize = gallery.finalsBytesUsed || 0;
		if (currentFinalsSize + fileSize > gallery.finalsLimitBytes) {
			const usedMB = (currentFinalsSize / (1024 * 1024)).toFixed(2);
			const limitMB = (gallery.finalsLimitBytes / (1024 * 1024)).toFixed(2);
			const fileMB = (fileSize / (1024 * 1024)).toFixed(2);
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Finals storage limit exceeded',
					message: `Finals storage limit reached. Used: ${usedMB} MB / ${limitMB} MB. File size: ${fileMB} MB. Please delete some final photos or upgrade your plan.`
				})
			};
		}
	}

	// Key format: galleries/{galleryId}/final/{orderId}/{filename}
	// Store in original, unprocessed format
	// Use Intelligent-Tiering for finals (served via CloudFront, no direct S3 access needed)
	const objectKey = `galleries/${galleryId}/final/${orderId}/${key}`;
	const cmd = new PutObjectCommand({
		Bucket: bucket,
		Key: objectKey,
		ContentType: contentType,
		StorageClass: 'INTELLIGENT_TIERING',
		// Finals are immutable once uploaded - set long cache time for CloudFront
		// CloudFront will cache for 1 year, reducing origin requests and costs
		CacheControl: 'max-age=31536000, immutable'
	});
	const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ url, key: objectKey, expiresInSeconds: 3600 })
	};
});

