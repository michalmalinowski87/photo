import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { createChangeRequestApprovedEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESClient({});

import { getSenderEmail } from '../../lib/src/email-config';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	let galleryUrl: string;
	try {
		galleryUrl = await getRequiredConfigValue(stage, 'PublicGalleryUrl', { envVarName: 'PUBLIC_GALLERY_URL' });
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing configuration', message: error.message }),
		};
	}
	const sender = await getSenderEmail();
	
	if (!galleriesTable || !ordersTable || !bucket) {
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

	// Change the order to CLIENT_SELECTING status (preserves all order data)
	const now = new Date().toISOString();
	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId: targetOrderId },
		UpdateExpression: 'SET deliveryStatus = :ds, updatedAt = :u REMOVE canceledAt',
		ExpressionAttributeValues: { 
			':ds': 'CLIENT_SELECTING',
			':u': now
		}
	}));

	// Unlock selection (no need to clear changeRequestPending flag - it's derived from order status)
	// Selection state is now stored in orders, not a separate selections table
	await ddb.send(new UpdateCommand({
		TableName: galleriesTable,
		Key: { galleryId },
		UpdateExpression: 'SET selectionStatus = :s, currentOrderId = :oid, updatedAt = :u',
		ExpressionAttributeValues: {
			':s': 'IN_PROGRESS',
			':oid': targetOrderId,
			':u': now
		}
	}));

	// Send email to client notifying them the change request was approved
	if (sender && gallery.clientEmail) {
	const base = galleryUrl.replace(/\/+$/, '');
	const galleryLink = `${base}/${galleryId}`;
		const emailTemplate = createChangeRequestApprovedEmail(
			galleryId,
			gallery.name || galleryId,
			gallery.clientEmail,
			galleryLink
		);
		
		try {
			logger.info('Sending SES email - Change Request Approved', {
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
			
			logger.info('SES email sent successfully - Change Request Approved', {
				messageId: result.MessageId,
				requestId: result.$metadata?.requestId,
				from: sender,
				to: gallery.clientEmail
			});
		} catch (err: any) {
			logger.error('SES send failed - Change Request Approved Email', {
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
		body: JSON.stringify({ galleryId, orderId: targetOrderId, unlocked: true })
	};
});

