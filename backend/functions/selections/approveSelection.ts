import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { getJWTFromEvent } from '../../lib/src/jwt';
import { createSelectionApprovedEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const lambda = new LambdaClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	if (!galleriesTable || !ordersTable) return { statusCode: 500, body: 'Missing tables' };

	const galleryId = event?.pathParameters?.id;
	if (!galleryId) return { statusCode: 400, body: 'missing id' };

	// Verify JWT token
	const jwtPayload = getJWTFromEvent(event);
	if (!jwtPayload || jwtPayload.galleryId !== galleryId) {
		return { statusCode: 401, body: 'Unauthorized. Please log in.' };
	}
	const clientId = jwtPayload.clientId;

	// Fetch gallery
	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };

	// Get selections from request body (stored in memory on frontend)
	const body = event?.body ? JSON.parse(event.body) : {};
	const selectedKeys: string[] = Array.isArray(body?.selectedKeys) ? body.selectedKeys : [];
	if (selectedKeys.length === 0) return { statusCode: 400, body: 'selectedKeys required' };

	// Query all orders once - reuse for all checks
	const ordersQuery = await ddb.send(new QueryCommand({
		TableName: ordersTable,
		KeyConditionExpression: 'galleryId = :g',
		ExpressionAttributeValues: { ':g': galleryId }
	}));
	const orders = ordersQuery.Items || [];

	// Check if there's already an order with CLIENT_APPROVED or PREPARING_DELIVERY status
	// (PREPARING_DELIVERY means photographer already did the work, so lock selection)
	const hasActiveOrder = orders.some((o: any) => 
		o.deliveryStatus === 'CLIENT_APPROVED' || o.deliveryStatus === 'PREPARING_DELIVERY'
	);
	if (hasActiveOrder) {
		return { statusCode: 403, body: 'selection already approved - order with CLIENT_APPROVED or PREPARING_DELIVERY status exists' };
	}

	// Compute overage from selected keys
	const selectedCount = selectedKeys.length;
	const pkg = gallery.pricingPackage as { includedCount?: number; extraPriceCents?: number } | undefined;
	
	// Check if this is "purchase more" scenario (there's a DELIVERED order but no active order)
	const hasDeliveredOrder = orders.some((o: any) => o.deliveryStatus === 'DELIVERED');
	const hasBlockingOrder = orders.some((o: any) => 
		o.deliveryStatus === 'CLIENT_APPROVED' || 
		o.deliveryStatus === 'PREPARING_DELIVERY' || 
		o.deliveryStatus === 'CHANGES_REQUESTED'
	);
	const isPurchaseMore = hasDeliveredOrder && !hasBlockingOrder;
	
	// For purchase more, each photo costs extra (no included count)
	// For first-time selection, use package pricing with included count
	const included = isPurchaseMore ? 0 : Math.max(0, pkg?.includedCount ?? 0);
	const extraPrice = Math.max(0, pkg?.extraPriceCents ?? 0);
	const overageCount = Math.max(0, selectedCount - included);
	const overageCents = overageCount * extraPrice;
	const totalCents = overageCents;

	const now = new Date().toISOString();
	// Check for existing orders: CHANGES_REQUESTED (restore) or CLIENT_SELECTING (update), otherwise create new
	// Priority: CHANGES_REQUESTED first (restore), then CLIENT_SELECTING (update)
	const existingOrder = orders.find((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED') 
		|| orders.find((o: any) => o.deliveryStatus === 'CLIENT_SELECTING');
	
	let orderId: string | undefined;
	let zipKey: string | undefined;
	let orderNumber: number | undefined;
	
	if (existingOrder) {
		orderId = existingOrder.orderId;
		orderNumber = existingOrder.orderNumber; // Preserve existing orderNumber
		await ddb.send(new UpdateCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId },
			UpdateExpression: 'SET deliveryStatus = :ds, selectedKeys = :sk, selectedCount = :sc, overageCount = :oc, overageCents = :ocents, totalCents = :tc, updatedAt = :u REMOVE canceledAt',
			ExpressionAttributeValues: {
				':ds': 'CLIENT_APPROVED',
				':sk': selectedKeys,
				':sc': selectedCount,
				':oc': overageCount,
				':ocents': overageCents,
				':tc': totalCents,
				':u': now
			}
		}));
	} else {
		// Create new order - reuse gallery from earlier fetch
		orderNumber = (gallery?.lastOrderNumber ?? 0) + 1;
		orderId = `${orderNumber}-${Date.now()}`;
		await ddb.send(new PutCommand({
			TableName: ordersTable,
			Item: {
				galleryId,
				orderId,
				orderNumber,
				deliveryStatus: 'CLIENT_APPROVED',
				paymentStatus: 'UNPAID',
				selectedKeys,
				selectedCount,
				overageCount,
				overageCents,
				totalCents,
				createdAt: now
			}
		}));
	}
	await ddb.send(new UpdateCommand({
		TableName: galleriesTable,
		Key: { galleryId },
		UpdateExpression: 'SET selectionStatus = :s, selectionStats = :stats, lastOrderNumber = :n, currentOrderId = :oid, updatedAt = :u',
		ExpressionAttributeValues: {
			':s': 'APPROVED',
			':stats': { selectedCount, overageCount, overageCents },
			':n': orderNumber,
			':oid': orderId,
			':u': now
		}
	}));
	
	// Generate ZIP (best effort) via lambda invoke
	if (zipFnName) {
		try {
			const payload = Buffer.from(JSON.stringify({ galleryId, keys: selectedKeys, orderId }));
			const invokeResponse = await lambda.send(new InvokeCommand({ 
				FunctionName: zipFnName, 
				Payload: payload, 
				InvocationType: 'RequestResponse'
			}));
			if (invokeResponse.Payload) {
				let zipResult = JSON.parse(Buffer.from(invokeResponse.Payload).toString());
				
				// When Lambda is invoked directly, it returns { statusCode, body } format
				// The body is a JSON string that needs to be parsed
				if (zipResult.statusCode && zipResult.body) {
					try {
						const bodyParsed = typeof zipResult.body === 'string' ? JSON.parse(zipResult.body) : zipResult.body;
						if (zipResult.statusCode !== 200) {
							logger.warn('ZIP generation Lambda returned error status', { 
								statusCode: zipResult.statusCode, 
								body: bodyParsed,
								galleryId,
								orderId
							});
						} else {
							// Success - use the parsed body as the result
							zipResult = bodyParsed;
						}
					} catch (bodyParseErr: any) {
						logger.warn('Failed to parse Lambda response body', { 
							error: bodyParseErr.message,
							galleryId,
							orderId
						});
						zipResult = null;
					}
				}
				
				if (zipResult && zipResult.zipKey) {
					zipKey = zipResult.zipKey;
					// Update order with zipKey
					await ddb.send(new UpdateCommand({
						TableName: ordersTable,
						Key: { galleryId, orderId },
						UpdateExpression: 'SET zipKey = :z',
						ExpressionAttributeValues: { ':z': zipKey }
					}));
				} else {
					logger.warn('ZIP generation did not return zipKey', { 
						response: zipResult,
						galleryId,
						orderId
					});
				}
			}
		} catch (err: any) {
			// Log but continue - ZIP generation can be retried later
			logger.warn('ZIP generation failed', { error: err.message, galleryId, orderId });
		}
	}

	// Notify photographer with summary (best effort)
	const sender = (globalThis as any).process?.env?.SENDER_EMAIL as string;
	const notify = gallery.ownerEmail;
	if (sender && notify && orderId) {
		const emailTemplate = createSelectionApprovedEmail(
			galleryId,
			clientId,
			selectedCount,
			overageCount,
			overageCents,
			orderId
		);
		try {
			logger.info('Sending SES email - Selection Approved', {
				from: sender,
				to: notify,
				subject: emailTemplate.subject,
				galleryId,
				orderId
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
			logger.info('SES email sent successfully - Selection Approved', {
				messageId: result.MessageId,
				requestId: result.$metadata?.requestId,
				from: sender,
				to: notify
			});
		} catch (err: any) {
			logger.error('SES send failed - Selection Approved Email', {
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
					orderId
				},
				envCheck: {
					senderConfigured: !!sender,
					notifyConfigured: !!notify
				}
			});
		}
	}
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			galleryId,
			clientId,
			orderId,
			zipKey,
			selectedCount,
			overageCount,
			overageCents,
			status: 'APPROVED'
		})
	};
});


