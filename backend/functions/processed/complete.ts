import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	if (!galleriesTable || !ordersTable || !bucket) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	if (!galleryId) return { statusCode: 400, body: 'missing id' };
	const body = event?.body ? JSON.parse(event.body) : {};
	const orderId: string | undefined = body?.orderId;
	if (!orderId) return { statusCode: 400, body: 'orderId required' };
	const requester = getUserIdFromEvent(event);

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	requireOwnerOr403(gallery.ownerId, requester);

	const o = await ddb.send(new GetCommand({ TableName: ordersTable, Key: { galleryId, orderId } }));
	const order = o.Item as any;
	if (!order) return { statusCode: 404, body: 'order not found' };

	// Get selected keys from order to clean up originals/thumbs/previews
	const selectedKeys: string[] = order?.selectedKeys && Array.isArray(order.selectedKeys) ? order.selectedKeys : [];

	// Clean up originals only (keep thumbnails and previews for display purposes)
	if (selectedKeys.length > 0) {
		try {
			const toDelete: { Key: string }[] = [];
			for (const key of selectedKeys) {
				// Only delete originals - keep thumbnails and previews for display
				toDelete.push({ Key: `galleries/${galleryId}/originals/${key}` });
			}

			// Batch delete (S3 allows up to 1000 objects per request)
			for (let i = 0; i < toDelete.length; i += 1000) {
				const chunk = toDelete.slice(i, i + 1000);
				await s3.send(new DeleteObjectsCommand({
					Bucket: bucket,
					Delete: { Objects: chunk }
				}));
			}
		} catch (err: any) {
			// Log error but continue with marking as delivered
			logger?.error('Failed to clean up originals', {
				error: err.message,
				galleryId,
				orderId,
				selectedKeysCount: selectedKeys.length
			});
		}
	}

	// Mark order delivered
	const now = new Date().toISOString();
	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId },
		UpdateExpression: 'SET deliveryStatus = :d, deliveredAt = :t',
		ExpressionAttributeValues: { ':d': 'DELIVERED', ':t': now }
	}));

	return { statusCode: 200, body: JSON.stringify({ galleryId, orderId, deliveryStatus: 'DELIVERED', deliveredAt: now }) };
});


