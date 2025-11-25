import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!galleriesTable || !ordersTable || !bucket) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	const filename = event?.pathParameters?.filename;

	if (!galleryId || !orderId || !filename) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId, orderId, and filename are required' })
		};
	}

	// Decode filename (URL encoded)
	const decodedFilename = decodeURIComponent(filename);

	// Verify gallery exists and user is owner
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

	// Construct S3 key for final image
	// Final images are stored at: galleries/{galleryId}/final/{orderId}/{filename}
	const finalImageKey = `galleries/${galleryId}/final/${orderId}/${decodedFilename}`;

	// Delete final image from S3
	try {
		await s3.send(new DeleteObjectCommand({
			Bucket: bucket,
			Key: finalImageKey
		}));
		logger?.info('Deleted final image', { galleryId, orderId, filename: decodedFilename, s3Key: finalImageKey });
	} catch (err: any) {
		logger?.error('Failed to delete final image from S3', {
			error: err.message,
			galleryId,
			orderId,
			filename: decodedFilename,
			s3Key: finalImageKey
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to delete final image', message: err.message })
		};
	}

	// Check if this was the last final image
	// If so, revert order status back to the appropriate status
	const finalPrefix = `galleries/${galleryId}/final/${orderId}/`;
	const listResponse = await s3.send(new ListObjectsV2Command({
		Bucket: bucket,
		Prefix: finalPrefix
	}));

	const remainingFinals = (listResponse.Contents || []).filter(obj => {
		const key = obj.Key || '';
		// Only count files directly under the prefix, not subdirectories
		return key.startsWith(finalPrefix) && key !== finalPrefix && !key.substring(finalPrefix.length).includes('/');
	});

	// If no finals remain and order is in PREPARING_DELIVERY, revert status
	if (remainingFinals.length === 0 && order.deliveryStatus === 'PREPARING_DELIVERY') {
		// Determine the appropriate status to revert to based on gallery type
		// Selection galleries: CLIENT_APPROVED
		// Non-selection galleries: AWAITING_FINAL_PHOTOS
		const targetStatus = gallery.selectionEnabled !== false ? 'CLIENT_APPROVED' : 'AWAITING_FINAL_PHOTOS';
		
		try {
			await ddb.send(new UpdateCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId },
				UpdateExpression: 'SET deliveryStatus = :ds',
				ConditionExpression: 'deliveryStatus = :currentStatus',
				ExpressionAttributeValues: {
					':ds': targetStatus,
					':currentStatus': 'PREPARING_DELIVERY'
				}
			}));
			logger?.info('Reverted order status after deleting last final', {
				galleryId,
				orderId,
				previousStatus: 'PREPARING_DELIVERY',
				newStatus: targetStatus,
				selectionEnabled: gallery.selectionEnabled
			});
		} catch (updateErr: any) {
			// If status changed between check and update, log and continue
			if (updateErr.name === 'ConditionalCheckFailedException') {
				logger?.warn('Order status changed between check and update', {
					galleryId,
					orderId,
					expectedStatus: 'PREPARING_DELIVERY'
				});
			} else {
				logger?.error('Failed to revert order status', {
					error: updateErr.message,
					galleryId,
					orderId
				});
				// Don't fail the deletion - status update is secondary
			}
		}
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			message: 'Final image deleted successfully',
			galleryId,
			orderId,
			filename: decodedFilename,
			remainingFinalsCount: remainingFinals.length,
			statusReverted: remainingFinals.length === 0 && order.deliveryStatus === 'PREPARING_DELIVERY'
		})
	};
});

