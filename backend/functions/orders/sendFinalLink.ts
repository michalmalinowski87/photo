import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { createFinalLinkEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const apiUrl = envProc?.env?.PUBLIC_GALLERY_URL as string || '';
	const sender = envProc?.env?.SENDER_EMAIL as string;
	if (!galleriesTable || !ordersTable || !sender || !bucket) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) return { statusCode: 400, body: 'missing id or orderId' };
	const requester = getUserIdFromEvent(event);

	// Get gallery to verify ownership
	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'gallery not found' };
	requireOwnerOr403(gallery.ownerId, requester);
	if (!gallery.clientEmail) return { statusCode: 400, body: 'clientEmail not set' };

	// Get order to verify it exists and get selected keys
	const orderGet = await ddb.send(new GetCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId }
	}));
	const order = orderGet.Item as any;
	if (!order) return { statusCode: 404, body: 'order not found' };
	
	// Verify order has correct status (galleryId check is redundant - queried by galleryId+orderId)
	// Can send final link from CLIENT_APPROVED or PREPARING_DELIVERY (photographer has uploaded photos)
	if (order.deliveryStatus !== 'CLIENT_APPROVED' && order.deliveryStatus !== 'PREPARING_DELIVERY') {
		return { statusCode: 400, body: `order must have deliveryStatus CLIENT_APPROVED or PREPARING_DELIVERY, got ${order.deliveryStatus}` };
	}


	const link = apiUrl ? `${apiUrl}/gallery/${galleryId}` : `https://your-frontend/gallery/${galleryId}`;
	const emailTemplate = createFinalLinkEmail(galleryId, gallery.galleryName || galleryId, gallery.clientEmail, link);
	try {
		logger.info('Sending SES email - Final Link', {
			from: sender,
			to: gallery.clientEmail,
			subject: emailTemplate.subject,
			galleryId,
			orderId,
			link
		});
		const result = await ses.send(new SendEmailCommand({
			Source: sender,
			Destination: { ToAddresses: [gallery.clientEmail] },
			Message: {
				Subject: { Data: emailTemplate.subject },
				Body: {
					Text: { Data: emailTemplate.text },
					Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
				}
			}
		}));
		logger.info('SES email sent successfully - Final Link', {
			messageId: result.MessageId,
			requestId: result.$metadata?.requestId,
			from: sender,
			to: gallery.clientEmail
		});
	} catch (err: any) {
		logger.error('SES send failed - Final Link Email', {
			error: {
				name: err.name,
				message: err.message,
				code: err.code,
				statusCode: err.$metadata?.httpStatusCode,
				requestId: err.$metadata?.requestId,
				stack: err.stack
			},
			emailDetails: {
				from: sender,
				to: gallery.clientEmail,
				subject: emailTemplate.subject,
				galleryId,
				orderId,
				link
			},
			envCheck: {
				senderConfigured: !!sender,
				apiUrlConfigured: !!apiUrl
			}
		});
		return { statusCode: 500, body: JSON.stringify({ error: 'email failed', message: err.message }) };
	}

	// After successfully sending email, mark order as DELIVERED and clean up originals/thumbs/previews
	const selectedKeys: string[] = order?.selectedKeys && Array.isArray(order.selectedKeys) ? order.selectedKeys : [];

	// Clean up originals, thumbs, and previews for selected photos (but keep ZIPs)
	if (selectedKeys.length > 0) {
		try {
			const toDelete: { Key: string }[] = [];
			for (const key of selectedKeys) {
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
			logger.info('Cleaned up originals/thumbs/previews', { galleryId, orderId, count: selectedKeys.length });
		} catch (err: any) {
			logger.error('Failed to clean up originals/thumbs/previews', {
				error: err.message,
				galleryId,
				orderId,
				selectedKeysCount: selectedKeys.length
			});
			// Continue with marking as delivered even if cleanup fails
		}
	}

	// Mark order as DELIVERED
	const now = new Date().toISOString();
	try {
		await ddb.send(new UpdateCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId },
			UpdateExpression: 'SET deliveryStatus = :d, deliveredAt = :t',
			ExpressionAttributeValues: { ':d': 'DELIVERED', ':t': now }
		}));
		logger.info('Order marked as DELIVERED', { galleryId, orderId, deliveredAt: now });
	} catch (err: any) {
		logger.error('Failed to mark order as DELIVERED', {
			error: err.message,
			galleryId,
			orderId
		});
		return { statusCode: 500, body: JSON.stringify({ error: 'failed to mark as delivered', message: err.message }) };
	}

	return { statusCode: 200, body: JSON.stringify({ galleryId, orderId, sent: true, link, deliveryStatus: 'DELIVERED', deliveredAt: now }) };
});

