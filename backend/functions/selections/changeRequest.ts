import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
import { getJWTFromEvent } from '../../lib/src/jwt';
import { createChangeRequestEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	if (!galleriesTable) return { statusCode: 500, body: 'Missing table' };
	const galleryId = event?.pathParameters?.id;
	if (!galleryId) return { statusCode: 400, body: 'missing id' };

	// Verify JWT token
	const jwtPayload = await getJWTFromEvent(event);
	if (!jwtPayload || jwtPayload.galleryId !== galleryId) {
		return { statusCode: 401, body: 'Unauthorized. Please log in.' };
	}
	const clientId = jwtPayload.clientId;

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	
	// Check if there's an order with CLIENT_APPROVED status
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	if (!ordersTable) return { statusCode: 500, body: 'Missing ORDERS_TABLE' };
	
	// Query all orders for this gallery and filter in memory (more reliable than FilterExpression)
	const ordersQuery = await ddb.send(new QueryCommand({
		TableName: ordersTable,
		KeyConditionExpression: 'galleryId = :g',
		ExpressionAttributeValues: { ':g': galleryId }
	}));
	const orders = ordersQuery.Items || [];
	const clientApprovedOrder = orders.find((o: any) => o.deliveryStatus === 'CLIENT_APPROVED');
	const preparingDeliveryOrder = orders.find((o: any) => o.deliveryStatus === 'PREPARING_DELIVERY');
	const changesRequestedOrder = orders.find((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
	
	// Check if there's already a CHANGES_REQUESTED order
	if (changesRequestedOrder) {
		return { statusCode: 400, body: 'change request already pending' };
	}
	
	// Can request changes for CLIENT_APPROVED or PREPARING_DELIVERY orders
	// (photographer has done work, but client can still request changes)
	const activeOrder = clientApprovedOrder || preparingDeliveryOrder;
	if (!activeOrder) {
		return { statusCode: 400, body: 'no active order to request changes for' };
	}
	
	// Check if change requests are blocked for this order
	if (activeOrder.changeRequestsBlocked === true) {
		return { 
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Change requests are not allowed for this order' })
		};
	}

	const now = new Date().toISOString();
	
	// Change order status to CHANGES_REQUESTED to preserve order state
	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId: activeOrder.orderId },
		UpdateExpression: 'SET deliveryStatus = :ds, updatedAt = :u',
		ExpressionAttributeValues: { 
			':ds': 'CHANGES_REQUESTED',
			':u': now
		}
	}));

	// Notify photographer
	const sender = envProc?.env?.SENDER_EMAIL as string;
	const notify = gallery.ownerEmail;
	if (sender && notify) {
		const emailTemplate = createChangeRequestEmail(galleryId, clientId || 'client');
		try {
			logger.info('Sending SES email - Change Request', {
				from: sender,
				to: notify,
				subject: emailTemplate.subject,
				galleryId,
				clientId: clientId || 'client'
			});
			const result = await ses.send(new SendEmailCommand({
				Source: sender,
				Destination: { ToAddresses: [notify] },
				Message: {
					Subject: { Data: emailTemplate.subject },
					Body: {
						Text: { Data: emailTemplate.text },
						Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
					}
				}
			}));
			logger.info('SES email sent successfully - Change Request', {
				messageId: result.MessageId,
				requestId: result.$metadata?.requestId,
				from: sender,
				to: notify
			});
		} catch (err: any) {
			logger.error('SES send failed - Change Request Email', {
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
					to: notify,
					subject: emailTemplate.subject,
					galleryId,
					clientId: clientId || 'client'
				},
				envCheck: {
					senderConfigured: !!sender,
					notifyConfigured: !!notify
				}
			});
		}
	}

	return { statusCode: 200, body: JSON.stringify({ galleryId, orderId: activeOrder.orderId }) };
});


