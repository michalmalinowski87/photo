import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';
import { createFinalLinkEmail, createFinalLinkEmailWithPasswordInfo, createGalleryPasswordEmail } from '../../lib/src/email';
import { getSenderEmail } from '../../lib/src/email-config';
import { getConfigWithEnvFallback } from '../../lib/src/ssm-config';
import {
	decryptClientGalleryPassword,
	getGalleryPasswordEncryptionSecret,
	isEncryptedClientGalleryPassword,
} from '../../lib/src/client-gallery-password';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const apiUrl = await getConfigWithEnvFallback(stage, 'PublicGalleryUrl', 'PUBLIC_GALLERY_URL') || '';
	const encSecret = await getGalleryPasswordEncryptionSecret(stage);
	const sender = await getSenderEmail();
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

	// Check if gallery is paid before allowing sending final links
	// This prevents sending final links for unpublished galleries
	let isPaid = false;
	try {
		const paidTransaction = await getPaidTransactionForGallery(galleryId);
		isPaid = !!paidTransaction;
	} catch (err) {
		// If transaction check fails, fall back to gallery state
		isPaid = gallery.state === 'PAID_ACTIVE';
	}

	if (!isPaid) {
		return { 
			statusCode: 403, 
			body: JSON.stringify({ 
				error: 'Gallery not published',
				message: 'Cannot send final link. Gallery must be published before sending final links to clients.'
			})
		};
	}

	// Get order to verify it exists and get selected keys
	const orderGet = await ddb.send(new GetCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId }
	}));
	const order = orderGet.Item as any;
	if (!order) return { statusCode: 404, body: 'order not found' };
	
	// Verify order has correct status (galleryId check is redundant - queried by galleryId+orderId)
	// Can send final link from PREPARING_DELIVERY (photographer has uploaded photos)
	// AWAITING_FINAL_PHOTOS orders cannot send final link until photos are uploaded (status changes to PREPARING_DELIVERY)
	if (order.deliveryStatus !== 'PREPARING_DELIVERY') {
		return { statusCode: 400, body: `order must have deliveryStatus PREPARING_DELIVERY to send final link, got ${order.deliveryStatus}` };
	}


	const link = apiUrl ? `${apiUrl}/${galleryId}` : `https://your-frontend/${galleryId}`;
	const galleryName = gallery.galleryName || galleryId;
	const isNonSelectionGallery = gallery.selectionEnabled === false;

	// For non-selection galleries, send two emails: one with link and password info, another with password
	if (isNonSelectionGallery) {
		// Check if password is available
		if (!gallery.clientPasswordEncrypted) {
			logger.error('Cannot send final link: password not available for non-selection gallery', {
				galleryId,
				orderId,
				selectionEnabled: gallery.selectionEnabled
			});
			return { statusCode: 400, body: JSON.stringify({ error: 'Password not set for gallery. Please set client password first.' }) };
		}

		// Decrypt password
		if (!encSecret) {
			return {
				statusCode: 500,
				body: JSON.stringify({
					error: 'Missing GalleryPasswordEncryptionSecret',
					message:
						'Cannot retrieve gallery password because encryption secret is not configured. Set SSM /PhotoHub/<stage>/GalleryPasswordEncryptionSecret or env GALLERY_PASSWORD_ENCRYPTION_SECRET.',
				}),
			};
		}

		if (!isEncryptedClientGalleryPassword(gallery.clientPasswordEncrypted)) {
			logger.error('Stored clientPasswordEncrypted is not in encrypted format', { galleryId, orderId });
			return { statusCode: 500, body: JSON.stringify({ error: 'Failed to retrieve password' }) };
		}

		let password: string;
		try {
			password = decryptClientGalleryPassword(gallery.clientPasswordEncrypted, encSecret);
		} catch {
			logger.error('Failed to decrypt stored password', {
				galleryId,
				orderId,
				hasEncSecret: true,
			});
			return { statusCode: 500, body: JSON.stringify({ error: 'Failed to retrieve password' }) };
		}

		// Send first email: link with password info
		const linkEmailTemplate = createFinalLinkEmailWithPasswordInfo(galleryId, galleryName, gallery.clientEmail, link);
		try {
			logger.info('Sending SES email - Final Link (with password info)', {
				from: sender,
				to: gallery.clientEmail,
				subject: linkEmailTemplate.subject,
				galleryId,
				orderId,
				link,
				selectionEnabled: false
			});
			const linkResult = await ses.send(new SendEmailCommand({
				Source: sender,
				Destination: { ToAddresses: [gallery.clientEmail] },
				Message: {
					Subject: { Data: linkEmailTemplate.subject },
					Body: {
						Text: { Data: linkEmailTemplate.text },
						Html: linkEmailTemplate.html ? { Data: linkEmailTemplate.html } : undefined
					}
				}
			}));
			logger.info('SES email sent successfully - Final Link (with password info)', {
				messageId: linkResult.MessageId,
				requestId: linkResult.$metadata?.requestId,
				from: sender,
				to: gallery.clientEmail
			});
		} catch (err: any) {
			logger.error('SES send failed - Final Link Email (with password info)', {
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
					subject: linkEmailTemplate.subject,
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

		// Send second email: password
		const passwordEmailTemplate = createGalleryPasswordEmail(galleryId, galleryName, gallery.clientEmail, password, link);
		try {
			logger.info('Sending SES email - Gallery Password (for final link)', {
				from: sender,
				to: gallery.clientEmail,
				subject: passwordEmailTemplate.subject,
				galleryId,
				orderId,
				selectionEnabled: false
			});
			const passwordResult = await ses.send(new SendEmailCommand({
				Source: sender,
				Destination: { ToAddresses: [gallery.clientEmail] },
				Message: {
					Subject: { Data: passwordEmailTemplate.subject },
					Body: {
						Text: { Data: passwordEmailTemplate.text },
						Html: passwordEmailTemplate.html ? { Data: passwordEmailTemplate.html } : undefined
					}
				}
			}));
			logger.info('SES email sent successfully - Gallery Password (for final link)', {
				messageId: passwordResult.MessageId,
				requestId: passwordResult.$metadata?.requestId,
				from: sender,
				to: gallery.clientEmail
			});
		} catch (err: any) {
			logger.error('SES send failed - Gallery Password Email (for final link)', {
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
					subject: passwordEmailTemplate.subject,
					galleryId,
					orderId
				},
				envCheck: {
					senderConfigured: !!sender,
					apiUrlConfigured: !!apiUrl
				}
			});
			return { statusCode: 500, body: JSON.stringify({ error: 'password email failed', message: err.message }) };
		}
	} else {
		// For selection galleries, send single email as before
		const emailTemplate = createFinalLinkEmail(galleryId, galleryName, gallery.clientEmail, link);
		try {
			logger.info('Sending SES email - Final Link', {
				from: sender,
				to: gallery.clientEmail,
				subject: emailTemplate.subject,
				galleryId,
				orderId,
				link,
				selectionEnabled: true
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
	}

	// Mark order as DELIVERED
	// Note: Originals cleanup is now optional and manual (via cleanup-originals endpoint)
	// Photographer can choose to clean up originals, previews, and thumbnails when marking as delivered
	const now = new Date().toISOString();
	const onOrderDeliveredFnName = envProc?.env?.ON_ORDER_DELIVERED_FN_NAME as string;
	
	// Set finalZipGenerating flag atomically with DELIVERED status to prevent duplicate stream triggers
	// The flag will be cleared by onOrderDelivered Lambda after ZIP generation completes
	// This ensures stream handler skips if explicit handler already triggered
	const updateExpr = onOrderDeliveredFnName
		? 'SET deliveryStatus = :d, deliveredAt = :t, finalZipGenerating = :g, finalZipGeneratingSince = :ts'
		: 'SET deliveryStatus = :d, deliveredAt = :t';
	const updateValues: any = {
		':d': 'DELIVERED',
		':t': now
	};
	if (onOrderDeliveredFnName) {
		updateValues[':g'] = true;
		updateValues[':ts'] = Date.now();
	}
	
	try {
		await ddb.send(new UpdateCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId },
			UpdateExpression: updateExpr,
			ExpressionAttributeValues: updateValues
		}));
		logger.info('Order marked as DELIVERED', { galleryId, orderId, deliveredAt: now, finalZipGeneratingSet: !!onOrderDeliveredFnName });
		
		// Trigger onOrderDelivered Lambda asynchronously to pre-generate finals ZIP and cleanup
		if (onOrderDeliveredFnName) {
			try {
				const lambda = new LambdaClient({});
				const payload = Buffer.from(JSON.stringify({ galleryId, orderId }));
				await lambda.send(new InvokeCommand({
					FunctionName: onOrderDeliveredFnName,
					Payload: payload,
					InvocationType: 'Event' // Async invocation
				}));
				logger.info('Triggered onOrderDelivered Lambda', { galleryId, orderId, fnName: onOrderDeliveredFnName });
			} catch (lambdaErr: any) {
				// Log but don't fail - ZIP pre-generation and cleanup are best effort
				logger.error('Failed to trigger onOrderDelivered Lambda', {
					error: lambdaErr.message,
					galleryId,
					orderId,
					fnName: onOrderDeliveredFnName
				});
			}
		}
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

