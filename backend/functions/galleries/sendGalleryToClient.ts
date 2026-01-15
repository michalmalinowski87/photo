import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { createGalleryInvitationEmail, createGalleryPasswordEmail, createGalleryReminderEmail } from '../../lib/src/email';
import { getSenderEmail } from '../../lib/src/email-config';
import { getConfigWithEnvFallback } from '../../lib/src/ssm-config';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const apiUrl = await getConfigWithEnvFallback(stage, 'PublicGalleryUrl', 'PUBLIC_GALLERY_URL') || '';
	const sender = await getSenderEmail();
	
	if (!galleriesTable || !sender) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing configuration' })
		};
	}

	const galleryId = event?.pathParameters?.id;
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

	// Get gallery
	const galleryGet = await ddb.send(new GetCommand({
		TableName: galleriesTable,
		Key: { galleryId }
	}));

	const gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}

	requireOwnerOr403(gallery.ownerId, requester);

	// Check if selection is enabled
	if (!gallery.selectionEnabled) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery does not have selection enabled' })
		};
	}

	// Check if client email and password are set
	if (!gallery.clientEmail) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Client email not set. Please set client email and password first.' })
		};
	}

	if (!gallery.clientPasswordHash || !gallery.clientPasswordSalt || !gallery.clientPasswordIter) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Client password not set. Please set client email and password first.' })
		};
	}

	// Check if password is stored encrypted (for retrieval when sending)
	// If not, require it to be passed in the request body
	const body = event?.body ? JSON.parse(event.body) : {};
	let password = body?.password;

	// If password is stored encrypted, decrypt it
	// Otherwise, require it to be passed
	if (!password && gallery.clientPasswordEncrypted) {
		// Decrypt password (simple base64 decode for now - in production, use proper encryption)
		try {
			password = Buffer.from(gallery.clientPasswordEncrypted, 'base64').toString('utf-8');
		} catch (e) {
			logger?.warn('Failed to decrypt stored password', { galleryId });
		}
	}

	if (!password || typeof password !== 'string') {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Password required to send email. Please provide the password in the request body, or set it during gallery creation.' })
		};
	}

	const galleryLink = apiUrl ? `${apiUrl}/${galleryId}` : `https://your-frontend/${galleryId}`;
	const galleryName = gallery.galleryName || galleryId;
	const clientEmail = gallery.clientEmail;

	// Check if gallery has existing orders to determine if this is a reminder or initial invitation
	let hasExistingOrders = false;
	if (ordersTable) {
		try {
			const ordersQuery = await ddb.send(new QueryCommand({
				TableName: ordersTable,
				KeyConditionExpression: 'galleryId = :g',
				ExpressionAttributeValues: { ':g': galleryId }
			}));
			const orders = ordersQuery.Items || [];
			hasExistingOrders = orders.length > 0;
		} catch (err) {
			// Log but continue - if we can't check orders, default to invitation behavior
			logger?.warn('Failed to check existing orders', { galleryId, error: err });
		}
	}

	// Send invitation or reminder email based on whether orders exist
	const emailType = hasExistingOrders ? 'Gallery Reminder' : 'Gallery Invitation';
	const emailTemplate = hasExistingOrders 
		? createGalleryReminderEmail(galleryId, galleryName, clientEmail, galleryLink)
		: createGalleryInvitationEmail(galleryId, galleryName, clientEmail, galleryLink);
	
	try {
		logger.info(`Sending SES email - ${emailType}`, {
			from: sender,
			to: clientEmail,
			subject: emailTemplate.subject,
			galleryId,
			galleryName,
			isReminder: hasExistingOrders
		});

		const emailResult = await ses.send(new SendEmailCommand({
			Source: sender,
			Destination: { ToAddresses: [clientEmail] },
			Message: {
				Subject: { Data: emailTemplate.subject },
				Body: {
					Text: { Data: emailTemplate.text },
					Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
				}
			}
		}));

		logger.info(`SES email sent successfully - ${emailType}`, {
			messageId: emailResult.MessageId,
			requestId: emailResult.$metadata?.requestId,
			from: sender,
			to: clientEmail,
			isReminder: hasExistingOrders
		});
	} catch (err: any) {
		const errorCode = err.code || err.name;
		const errorMessage = err.message || 'Unknown error';
		// Distinguish between throttling (send rate limit) and daily quota
		const isThrottlingError = errorCode === 'Throttling';
		const isDailyQuotaError = errorCode === 'MessageRejected' ||
			errorMessage.toLowerCase().includes('daily message quota') ||
			errorMessage.toLowerCase().includes('daily sending quota');
		
		logger.error(`SES send failed - ${emailType} Email`, {
			error: {
				name: err.name,
				message: errorMessage,
				code: errorCode,
				statusCode: err.$metadata?.httpStatusCode,
				requestId: err.$metadata?.requestId,
				isThrottlingError,
				isDailyQuotaError,
				stack: err.stack
			},
			galleryId,
			clientEmail
		});
		
		// For daily quota errors, return 429 with helpful message
		if (isDailyQuotaError) {
			return {
				statusCode: 429, // Too Many Requests
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: `Failed to send ${hasExistingOrders ? 'reminder' : 'invitation'} email`,
					message: 'Daily email sending limit reached. The email will be sent automatically once the limit resets (usually within 24 hours). You can still share the gallery link manually.',
					quotaExceeded: true,
					originalError: errorMessage
				})
			};
		}
		
		// For throttling errors (send rate limit), retry with exponential backoff
		if (isThrottlingError) {
			// Retry up to 3 times with exponential backoff: 1s, 2s, 4s
			for (let attempt = 0; attempt < 3; attempt++) {
				const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
				logger.info(`Retrying ${emailType} email send after throttling`, {
					attempt: attempt + 1,
					delayMs,
					galleryId
				});
				
				await new Promise(resolve => setTimeout(resolve, delayMs));
				
				try {
					const retryResult = await ses.send(new SendEmailCommand({
						Source: sender,
						Destination: { ToAddresses: [clientEmail] },
						Message: {
							Subject: { Data: emailTemplate.subject },
							Body: {
								Text: { Data: emailTemplate.text },
								Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
							}
						}
					}));
					
					logger.info(`SES email sent successfully after retry - ${emailType}`, {
						messageId: retryResult.MessageId,
						requestId: retryResult.$metadata?.requestId,
						attempt: attempt + 1,
						galleryId
					});
					
					// Success - break out of retry loop
					break;
				} catch (retryErr: any) {
					if (attempt === 2) {
						// Final attempt failed - return error
						return {
							statusCode: 429,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ 
								error: `Failed to send ${hasExistingOrders ? 'reminder' : 'invitation'} email`,
								message: 'Email sending rate limit exceeded. Please try again in a few seconds.',
								rateLimited: true,
								originalError: retryErr.message || errorMessage
							})
						};
					}
					// Continue to next retry attempt
				}
			}
		} else {
			// Other errors - return 500
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: `Failed to send ${hasExistingOrders ? 'reminder' : 'invitation'} email`, 
					message: errorMessage 
				})
			};
		}
	}

	// Add delay between emails to avoid SES send rate throttling
	// SES sandbox typically allows 1 email per second, so wait 1.5 seconds to be safe
	await new Promise(resolve => setTimeout(resolve, 1500));

	// Send password email (separate function call for future flexibility - e.g., SMS)
	// Always send password email regardless of whether it's invitation or reminder
	try {
		const passwordTemplate = createGalleryPasswordEmail(galleryId, galleryName, clientEmail, password, galleryLink);
		
		logger.info('Sending SES email - Gallery Password', {
			from: sender,
			to: clientEmail,
			subject: passwordTemplate.subject,
			galleryId,
			galleryName
		});

		const passwordResult = await ses.send(new SendEmailCommand({
			Source: sender,
			Destination: { ToAddresses: [clientEmail] },
			Message: {
				Subject: { Data: passwordTemplate.subject },
				Body: {
					Text: { Data: passwordTemplate.text },
					Html: passwordTemplate.html ? { Data: passwordTemplate.html } : undefined
				}
			}
		}));

		logger.info('SES email sent successfully - Gallery Password', {
			messageId: passwordResult.MessageId,
			requestId: passwordResult.$metadata?.requestId,
			from: sender,
			to: clientEmail
		});
	} catch (err: any) {
		const errorCode = err.code || err.name;
		const errorMessage = err.message || 'Unknown error';
		const isQuotaError = errorCode === 'Throttling' || 
			errorCode === 'MessageRejected' ||
			errorMessage.toLowerCase().includes('quota') ||
			errorMessage.toLowerCase().includes('daily message quota');
		
		logger.error('SES send failed - Gallery Password Email', {
			error: {
				name: err.name,
				message: errorMessage,
				code: errorCode,
				statusCode: err.$metadata?.httpStatusCode,
				requestId: err.$metadata?.requestId,
				isThrottlingError: errorCode === 'Throttling',
				isDailyQuotaError: errorCode === 'MessageRejected' ||
					errorMessage.toLowerCase().includes('daily message quota') ||
					errorMessage.toLowerCase().includes('daily sending quota'),
				stack: err.stack
			},
			galleryId,
			clientEmail
		});
		
		// Distinguish between throttling (send rate limit) and daily quota
		const isThrottlingError = errorCode === 'Throttling';
		const isDailyQuotaError = errorCode === 'MessageRejected' ||
			errorMessage.toLowerCase().includes('daily message quota') ||
			errorMessage.toLowerCase().includes('daily sending quota');
		
		// For daily quota errors, return 429 with helpful message
		if (isDailyQuotaError) {
			return {
				statusCode: 429, // Too Many Requests
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Failed to send password email',
					message: 'Daily email sending limit reached. You can still share the gallery link and password manually with your client.',
					quotaExceeded: true,
					originalError: errorMessage
				})
			};
		}
		
		// For throttling errors (send rate limit), retry with exponential backoff
		if (isThrottlingError) {
			// Retry up to 3 times with exponential backoff: 1s, 2s, 4s
			for (let attempt = 0; attempt < 3; attempt++) {
				const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
				logger.info('Retrying password email send after throttling', {
					attempt: attempt + 1,
					delayMs,
					galleryId
				});
				
				await new Promise(resolve => setTimeout(resolve, delayMs));
				
				try {
					const retryResult = await ses.send(new SendEmailCommand({
						Source: sender,
						Destination: { ToAddresses: [clientEmail] },
						Message: {
							Subject: { Data: passwordTemplate.subject },
							Body: {
								Text: { Data: passwordTemplate.text },
								Html: passwordTemplate.html ? { Data: passwordTemplate.html } : undefined
							}
						}
					}));
					
					logger.info('SES email sent successfully after retry - Gallery Password', {
						messageId: retryResult.MessageId,
						requestId: retryResult.$metadata?.requestId,
						attempt: attempt + 1,
						galleryId
					});
					
					// Success - break out of retry loop
					break;
				} catch (retryErr: any) {
					if (attempt === 2) {
						// Final attempt failed - return error
						return {
							statusCode: 429,
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ 
								error: 'Failed to send password email',
								message: 'Email sending rate limit exceeded. Please try again in a few seconds.',
								rateLimited: true,
								originalError: retryErr.message || errorMessage
							})
						};
					}
					// Continue to next retry attempt
				}
			}
		} else {
			// Other errors - return 500
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Failed to send password email', 
					message: errorMessage 
				})
			};
		}
	}

	// Create order with CLIENT_SELECTING status ONLY if no orders exist at all (initial invitation)
	// For reminders (when orders exist), don't create a new order
	if (ordersTable && !hasExistingOrders) {
		try {
			// Double-check for existing orders (in case the earlier check failed)
			const ordersQuery = await ddb.send(new QueryCommand({
				TableName: ordersTable,
				KeyConditionExpression: 'galleryId = :g',
				ExpressionAttributeValues: { ':g': galleryId }
			}));
			const orders = ordersQuery.Items || [];
			
			// Only create order if no orders exist at all
			if (orders.length === 0) {
				const now = new Date().toISOString();
				const orderNumber = (gallery.lastOrderNumber ?? 0) + 1;
				const orderId = `${orderNumber}-${Date.now()}`;
				
				// Determine payment status for first order
				// For selection galleries, payment status is typically UNPAID until client approves selection
				// However, if this is the first order and there was an initial payment, we could check it
				// For now, set to UNPAID since we don't know the order total yet (client hasn't selected)
				const orderPaymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' = 'UNPAID';
				
				// If this is the first order, check if there's any initial payment logic to apply
				// Note: For selection galleries, the order total depends on what client selects,
				// so we can't determine payment status until selection is approved
				// But if there was an initial payment that covers the package price, we could mark as PARTIALLY_PAID
				// For now, we'll keep it as UNPAID and let the selection approval process handle payment status
				
				await ddb.send(new PutCommand({
					TableName: ordersTable,
					Item: {
						galleryId,
						orderId,
						orderNumber,
						ownerId: gallery.ownerId, // Denormalize ownerId for efficient querying
						deliveryStatus: 'CLIENT_SELECTING',
						paymentStatus: orderPaymentStatus,
						selectedKeys: [],
						selectedCount: 0,
						overageCount: 0,
						overageCents: 0,
						totalCents: 0,
						createdAt: now
					}
				}));
				
				// Update gallery with order info
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET lastOrderNumber = :n, currentOrderId = :oid, updatedAt = :u',
					ExpressionAttributeValues: {
						':n': orderNumber,
						':oid': orderId,
						':u': now
					}
				}));
				
				logger.info('Order created with CLIENT_SELECTING status when sending initial gallery invitation', {
					galleryId,
					orderId,
					orderNumber,
					orderPaymentStatus
				});
			} else {
				logger.info('Orders already exist, skipping order creation (reminder email sent)', {
					galleryId,
					existingOrders: orders.map((o: any) => ({
						orderId: o.orderId,
						deliveryStatus: o.deliveryStatus
					}))
				});
			}
		} catch (orderErr: any) {
			// Log but don't fail email sending if order creation fails
			logger.error('Failed to create order when sending gallery to client', {
				error: {
					name: orderErr.name,
					message: orderErr.message
				},
				galleryId
			});
		}
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			galleryId, 
			sent: true, 
			clientEmail,
			invitationSent: !hasExistingOrders,
			reminderSent: hasExistingOrders,
			passwordSent: true,
			isReminder: hasExistingOrders
		})
	};
});

