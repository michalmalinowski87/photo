import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { createChangeRequestDeniedEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const apiUrl = envProc?.env?.PUBLIC_GALLERY_URL as string || '';
	const sender = envProc?.env?.SENDER_EMAIL as string;
	
	if (!galleriesTable || !ordersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}
	
	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId' })
		};
	}
	
	const requester = getUserIdFromEvent(event);
	if (!requester) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}
	requireOwnerOr403(gallery.ownerId, requester);
	
	// Find the CHANGES_REQUESTED order
	let targetOrderId = orderId;
	let order: any;
	
	if (targetOrderId) {
		// If orderId provided, fetch directly
		const orderGet = await ddb.send(new GetCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId: targetOrderId }
		}));
		order = orderGet.Item;
		if (!order) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Order not found' })
			};
		}
		if (order.deliveryStatus !== 'CHANGES_REQUESTED') {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: `Order must have deliveryStatus CHANGES_REQUESTED, got ${order.deliveryStatus}` })
			};
		}
	} else {
		// Auto-find the CHANGES_REQUESTED order
		const ordersQuery = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: { ':g': galleryId }
		}));
		const orders = ordersQuery.Items || [];
		order = orders.find((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
		if (!order) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'no CHANGES_REQUESTED order found for this gallery' })
			};
		}
		targetOrderId = order.orderId;
	}

	// Determine previous status - check if final photos exist to determine previous status
	// If final photos exist, order was in PREPARING_DELIVERY, otherwise CLIENT_APPROVED
	let previousStatus = 'CLIENT_APPROVED'; // Default revert status
	
	if (bucket) {
		try {
			// Check if final photos exist (optimized: MaxKeys=1, stops after first match)
			const prefix = `galleries/${galleryId}/final/${targetOrderId}/`;
			const finalFilesResponse = await s3.send(new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix,
				MaxKeys: 1 // Only need to know if at least one file exists - stops after first match
			}));

			// Filter out subdirectories (previews/, thumbs/, bigthumbs/) - only count direct files
			const hasFinalPhotos = (finalFilesResponse.Contents || []).some(obj => {
				const objKey = obj.Key || '';
				return objKey.startsWith(prefix) && 
					objKey !== prefix && 
					!objKey.substring(prefix.length).includes('/');
			});

			previousStatus = hasFinalPhotos ? 'PREPARING_DELIVERY' : 'CLIENT_APPROVED';
		} catch (s3Error: any) {
			logger?.warn('Failed to check final photos, defaulting to CLIENT_APPROVED', {
				error: {
					name: s3Error.name,
					message: s3Error.message
				},
				galleryId,
				orderId: targetOrderId
			});
			// Default to CLIENT_APPROVED if S3 check fails
			previousStatus = 'CLIENT_APPROVED';
		}
	}
	
	// Get reason and preventFutureChangeRequests from request body (optional)
	const requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
	const reason = requestBody.reason?.trim() || undefined;
	const preventFutureChangeRequests = requestBody.preventFutureChangeRequests === true;
	
	const now = new Date().toISOString();
	
	// Build update expression - include changeRequestsBlocked if preventFutureChangeRequests is true
	const updateExpression = preventFutureChangeRequests
		? 'SET deliveryStatus = :ds, changeRequestsBlocked = :crb, updatedAt = :u'
		: 'SET deliveryStatus = :ds, updatedAt = :u';
	
	const expressionAttributeValues: any = {
		':ds': previousStatus,
		':u': now
	};
	
	if (preventFutureChangeRequests) {
		expressionAttributeValues[':crb'] = true;
	}
	
	// Revert order status to previous status and optionally block future change requests
	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId: targetOrderId },
		UpdateExpression: updateExpression,
		ExpressionAttributeValues: expressionAttributeValues
	}));

	// Send email to client notifying them the change request was denied
	if (sender && gallery.clientEmail) {
		const galleryLink = `${apiUrl}/gallery/${galleryId}`;
		const emailTemplate = createChangeRequestDeniedEmail(
			galleryId,
			gallery.name || galleryId,
			gallery.clientEmail,
			galleryLink,
			reason
		);
		
		try {
			logger.info('Sending SES email - Change Request Denied', {
				from: sender,
				to: gallery.clientEmail,
				subject: emailTemplate.subject,
				galleryId,
				orderId: targetOrderId
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
			
			logger.info('SES email sent successfully - Change Request Denied', {
				messageId: result.MessageId,
				requestId: result.$metadata?.requestId,
				from: sender,
				to: gallery.clientEmail
			});
		} catch (err: any) {
			logger.error('SES send failed - Change Request Denied Email', {
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
					orderId: targetOrderId
				},
				envCheck: {
					senderConfigured: !!sender,
					clientEmailConfigured: !!gallery.clientEmail
				}
			});
			// Don't fail the request if email fails
		}
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			galleryId,
			orderId: targetOrderId,
			previousStatus,
			reason: reason || null,
			changeRequestsBlocked: preventFutureChangeRequests,
			message: preventFutureChangeRequests
				? 'Change request denied. Order reverted to previous status. Future change requests are now blocked.'
				: 'Change request denied. Order reverted to previous status.'
		})
	};
});

