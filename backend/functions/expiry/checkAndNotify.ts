import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
import { createExpiryWarningEmail, createExpiryFinalWarningEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});

import { lambdaLogger } from '../../../packages/logger/src';

async function getOwnerEmail(gallery: any, userPoolId: string | undefined, logger: any): Promise<string | undefined> {
	// First try ownerEmail from gallery record
	if (gallery.ownerEmail) {
		return gallery.ownerEmail;
	}

	// Fallback: get from Cognito
	if (userPoolId && gallery.ownerId) {
		try {
			const cognitoResponse = await cognito.send(new AdminGetUserCommand({
				UserPoolId: userPoolId,
				Username: gallery.ownerId
			}));
			const emailAttr = cognitoResponse.UserAttributes?.find((attr: any) => attr.Name === 'email');
			if (emailAttr?.Value) {
				return emailAttr.Value;
			}
		} catch (err: any) {
			logger.warn('Failed to get owner email from Cognito', {
				error: err.message,
				galleryId: gallery.galleryId,
				ownerId: gallery.ownerId
			});
		}
	}

	return undefined;
}

async function sendEmail(to: string, template: any, sender: string, logger: any, context: string) {
	try {
		const result = await ses.send(new SendEmailCommand({
			Source: sender,
			Destination: { ToAddresses: [to] },
			Message: {
				Subject: { Data: template.subject },
				Body: {
					Text: { Data: template.text },
					Html: template.html ? { Data: template.html } : undefined
				}
			}
		}));
		logger.info(`SES email sent successfully - ${context}`, {
			messageId: result.MessageId,
			to,
			requestId: result.$metadata?.requestId
		});
		return true;
	} catch (err: any) {
		logger.error(`SES send failed - ${context}`, {
			error: {
				name: err.name,
				message: err.message,
				code: err.code,
				statusCode: err.$metadata?.httpStatusCode,
				requestId: err.$metadata?.requestId
			},
			to
		});
		return false;
	}
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const sender = envProc?.env?.SENDER_EMAIL as string;
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	const apiUrl = envProc?.env?.PUBLIC_GALLERY_URL as string || '';
	
	if (!galleriesTable || !sender) return;

	const now = Date.now();
	const sevenDaysFromNow = now + 7 * 24 * 3600 * 1000;
	const twentyFourHoursFromNow = now + 24 * 3600 * 1000;
	
	// Scan galleries for expiry warnings
	// Note: Deletion is handled by EventBridge Scheduler, not this function
	// This function sends warning emails (7 days for paid, 24h for unpaid)
	// Using scan is acceptable here since:
	// 1. We run every 6 hours (4x per day) - reasonable cost vs frequency balance
	// 2. Most galleries won't match the filter (expiring in next 7 days)
	const allItems: any[] = [];
	let lastEvaluatedKey: any = undefined;
	
	// Scan all galleries
	do {
		const scanParams: any = {
			TableName: galleriesTable
		};
		
		if (lastEvaluatedKey) {
			scanParams.ExclusiveStartKey = lastEvaluatedKey;
		}
		
		const res = await ddb.send(new ScanCommand(scanParams));
		if (res.Items) {
			allItems.push(...res.Items);
		}
		lastEvaluatedKey = res.LastEvaluatedKey;
	} while (lastEvaluatedKey);
	
	logger.info('Found galleries to check for expiry warnings', { count: allItems.length });
	
	for (const item of allItems) {
		const galleryId = item.galleryId as string;
		const galleryName = item.galleryName as string | undefined;
		const clientEmail = item.clientEmail as string | undefined;
		const expiresAt = item.expiresAt ? Date.parse(item.expiresAt as string) : undefined;
		const expiryWarning7dSent = item.expiryWarning7dSent as boolean | undefined;
		const expiryWarning24hSent = item.expiryWarning24hSent as boolean | undefined;
		const state = item.state as string | undefined;
		
		// Skip if no expiry date
		if (!expiresAt) {
			continue;
		}
		
		// Check payment status to determine if this is an UNPAID gallery
		const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
		let isPaid = false;
		if (transactionsTable) {
			try {
				const { getPaidTransactionForGallery } = require('../../lib/src/transactions');
				const paidTransaction = await getPaidTransactionForGallery(galleryId);
				isPaid = !!paidTransaction;
			} catch (err) {
				isPaid = state === 'PAID_ACTIVE';
			}
		} else {
			isPaid = state === 'PAID_ACTIVE';
		}
		
		const expiryDate = expiresAt;
		
		// Only process if expiry is within 7 days (for paid) or 24h (for unpaid)
		// Note: Actual deletion is handled by EventBridge Scheduler, not this function
		if (isPaid && expiryDate > sevenDaysFromNow) continue;
		if (!isPaid && expiryDate > twentyFourHoursFromNow) continue;
		
		// Skip already-expired galleries - EventBridge Scheduler will handle deletion
		if (expiryDate <= now) {
			logger.info('Gallery already expired - EventBridge Scheduler will handle deletion', { galleryId });
			continue;
		}
		
		const link = apiUrl ? `${apiUrl}/gallery/${galleryId}` : `https://your-frontend/gallery/${galleryId}`;
		const daysRemaining = Math.ceil((expiryDate - now) / (24 * 3600 * 1000));
		
		// Get owner email (from gallery or Cognito)
		const ownerEmail = await getOwnerEmail(item, userPoolId, logger);
		
		// For UNPAID galleries: send 24h warning before expiry
		if (!isPaid && expiryDate > now && expiryDate <= twentyFourHoursFromNow) {
			const template = createExpiryFinalWarningEmail(galleryId, galleryName || galleryId, link);
			
			// Send to photographer only (client doesn't need to know about unpaid drafts)
			if (ownerEmail) {
				await sendEmail(ownerEmail, template, sender, logger, 'UNPAID Gallery Expiry Warning 24h - Photographer');
			}
			
			// Store notification in gallery (can be retrieved via API for in-app notifications)
			try {
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET expiryWarning24hSent = :sent',
					ExpressionAttributeValues: { ':sent': true }
				}));
			} catch (updateErr: any) {
				logger.warn('Failed to update expiryWarning24hSent flag', { error: updateErr.message, galleryId });
			}
		}
		
		// For paid galleries: 7-day warning
		if (isPaid && expiryDate > now && expiryDate <= sevenDaysFromNow && !expiryWarning7dSent) {
			const template = createExpiryWarningEmail(galleryId, galleryName || galleryId, daysRemaining, link);
			
			// Send to photographer
			if (ownerEmail) {
				await sendEmail(ownerEmail, template, sender, logger, 'Expiry Warning 7d - Photographer');
			}
			
			// Send to client
			if (clientEmail) {
				await sendEmail(clientEmail, template, sender, logger, 'Expiry Warning 7d - Client');
			}
			
			// Mark as sent
			try {
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET expiryWarning7dSent = :sent',
					ExpressionAttributeValues: { ':sent': true }
				}));
			} catch (updateErr: any) {
				logger.warn('Failed to update expiryWarning7dSent flag', { error: updateErr.message, galleryId });
			}
		}
		
		// For paid galleries: 24-hour warning
		if (isPaid && expiryDate > now && expiryDate <= twentyFourHoursFromNow && !expiryWarning24hSent) {
			const template = createExpiryFinalWarningEmail(galleryId, galleryName || galleryId, link);
			
			// Send to photographer
			if (ownerEmail) {
				await sendEmail(ownerEmail, template, sender, logger, 'Expiry Warning 24h - Photographer');
			}
			
			// Send to client
			if (clientEmail) {
				await sendEmail(clientEmail, template, sender, logger, 'Expiry Warning 24h - Client');
			}
			
			// Mark as sent
			try {
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET expiryWarning24hSent = :sent',
					ExpressionAttributeValues: { ':sent': true }
				}));
			} catch (updateErr: any) {
				logger.warn('Failed to update expiryWarning24hSent flag', { error: updateErr.message, galleryId });
			}
		}
		
		// Note: Gallery deletion is handled by EventBridge Scheduler
		// This function only sends warning emails and migrates existing galleries
	}
});


