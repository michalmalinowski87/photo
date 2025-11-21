import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { hasAddon, ADDON_TYPES } from '../../lib/src/addons';

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

	// Check if this is the first final photo being uploaded
	const prefix = `galleries/${galleryId}/final/${orderId}/`;
	const existingFiles = await s3.send(new ListObjectsV2Command({
		Bucket: bucket,
		Prefix: prefix,
		MaxKeys: 1
	}));
	const isFirstPhoto = !existingFiles.Contents || existingFiles.Contents.length === 0;

	// If this is the first photo, update status to PREPARING_DELIVERY
	// CLIENT_APPROVED → PREPARING_DELIVERY (selection galleries)
	// AWAITING_FINAL_PHOTOS → PREPARING_DELIVERY (non-selection galleries)
	if (isFirstPhoto && (order.deliveryStatus === 'CLIENT_APPROVED' || order.deliveryStatus === 'AWAITING_FINAL_PHOTOS')) {
		// Update status to PREPARING_DELIVERY
		await ddb.send(new UpdateCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId },
			UpdateExpression: 'SET deliveryStatus = :ds',
			ExpressionAttributeValues: {
				':ds': 'PREPARING_DELIVERY'
			}
		}));
	}

	// Always remove originals, thumbs, and previews when first final photo is uploaded
	// Backup addon ensures ZIPs are generated, but originals should be removed to save storage
	// This applies to CLIENT_APPROVED (selection galleries), AWAITING_FINAL_PHOTOS (non-selection galleries), and PREPARING_DELIVERY
	if (isFirstPhoto && (order.deliveryStatus === 'CLIENT_APPROVED' || order.deliveryStatus === 'AWAITING_FINAL_PHOTOS' || order.deliveryStatus === 'PREPARING_DELIVERY')) {
		const selectedKeys: string[] = order?.selectedKeys && Array.isArray(order.selectedKeys) ? order.selectedKeys : [];
		let keysToDelete: string[] = selectedKeys;
		
		// If selectedKeys is empty (non-selection galleries), list all originals from S3
		if (selectedKeys.length === 0) {
			try {
				const originalsPrefix = `galleries/${galleryId}/originals/`;
				const originalsListResponse = await s3.send(new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: originalsPrefix
				}));
				keysToDelete = (originalsListResponse.Contents || [])
					.map(obj => {
						const fullKey = obj.Key || '';
						return fullKey.replace(originalsPrefix, '');
					})
					.filter((key): key is string => Boolean(key));
			} catch (listErr: any) {
				logger?.error('Failed to list originals for deletion', {
					error: listErr.message,
					galleryId,
					orderId
				});
			}
		}
		
		if (keysToDelete.length > 0) {
			try {
				const toDelete: { Key: string }[] = [];
				for (const key of keysToDelete) {
					// Add originals, thumbs, and previews to deletion list
					toDelete.push({ Key: `galleries/${galleryId}/originals/${key}` });
					toDelete.push({ Key: `galleries/${galleryId}/thumbs/${key}` });
					toDelete.push({ Key: `galleries/${galleryId}/previews/${key}` });
				}

				// Batch delete (S3 allows up to 1000 objects per request)
				for (let i = 0; i < toDelete.length; i += 1000) {
					const chunk = toDelete.slice(i, i + 1000);
					await s3.send(new DeleteObjectsCommand({
						Bucket: bucket,
						Delete: { Objects: chunk }
					}));
				}
				logger?.info('Cleaned up originals/thumbs/previews (final photos uploaded)', { 
					galleryId, 
					orderId, 
					count: keysToDelete.length 
				});
			} catch (err: any) {
				// Log error but continue - originals deletion failure shouldn't block upload
				logger?.error('Failed to clean up originals/thumbs/previews', {
					error: err.message,
					galleryId,
					orderId,
					keysToDeleteCount: keysToDelete.length
				});
			}
		}
	}

	// Key format: galleries/{galleryId}/final/{orderId}/{filename}
	// Store in original, unprocessed format
	const objectKey = `galleries/${galleryId}/final/${orderId}/${key}`;
	const cmd = new PutObjectCommand({
		Bucket: bucket,
		Key: objectKey,
		ContentType: contentType
	});
	const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ url, key: objectKey, expiresInSeconds: 3600 })
	};
});

