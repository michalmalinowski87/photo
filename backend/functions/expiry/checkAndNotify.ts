import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { createExpiryWarningEmail, createExpiryFinalWarningEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});
const lambda = new LambdaClient({});

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
	const deleteFnName = envProc?.env?.GALLERIES_DELETE_FN_NAME as string;
	const apiUrl = envProc?.env?.PUBLIC_GALLERY_URL as string || '';
	
	if (!galleriesTable || !sender) return;

	const now = Date.now();
	const sevenDaysFromNow = now + 7 * 24 * 3600 * 1000;
	const twentyFourHoursFromNow = now + 24 * 3600 * 1000;
	
	// Scan galleries with filter for expiry warnings
	// Note: Deletion is handled automatically by DynamoDB TTL + Streams
	// This function only sends warning emails for galleries expiring soon
	// Using scan with filter is acceptable here since:
	// 1. We run every 6 hours (4x per day) - reasonable cost vs frequency balance
	// 2. We filter to only galleries with expiresAt set
	// 3. Most galleries won't match the filter (expiring in next 7 days)
	const nowISO = new Date(now).toISOString();
	const sevenDaysFromNowISO = new Date(sevenDaysFromNow).toISOString();
	
	const allItems: any[] = [];
	let lastEvaluatedKey: any = undefined;
	
	do {
		const scanParams: any = {
			TableName: galleriesTable,
			FilterExpression: 'attribute_exists(expiresAt) AND expiresAt <= :maxDate',
			ExpressionAttributeValues: {
				':maxDate': sevenDaysFromNowISO
			}
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
		const ttl = item.ttl as number | undefined;
		
		if (!expiresAt) continue;
		
		// Migration: Set ttl attribute for existing galleries that don't have it
		// This ensures DynamoDB TTL will work for existing galleries
		// Note: 'ttl' is a reserved keyword in DynamoDB, so we must use ExpressionAttributeNames
		if (!ttl && expiresAt) {
			const ttlExpiresAt = Math.floor(expiresAt / 1000); // Convert to Unix epoch seconds
			try {
				await ddb.send(new UpdateCommand({
					TableName: galleriesTable,
					Key: { galleryId },
					UpdateExpression: 'SET #ttl = :ttl',
					ExpressionAttributeNames: { '#ttl': 'ttl' },
					ExpressionAttributeValues: { ':ttl': ttlExpiresAt }
				}));
				logger.info('Set ttl attribute for existing gallery', { galleryId, ttl: ttlExpiresAt });
			} catch (updateErr: any) {
				logger.warn('Failed to set ttl attribute for gallery', { 
					error: updateErr.message, 
					galleryId 
				});
			}
		}
		
		// Fallback: Handle already-expired galleries that don't have ttl set yet
		// This ensures galleries that expired before migration are still cleaned up
		if (expiresAt <= now && !ttl && deleteFnName) {
			logger.info('Gallery already expired without ttl, triggering immediate cleanup', { galleryId });
			try {
				await lambda.send(new InvokeCommand({
					FunctionName: deleteFnName,
					InvocationType: 'Event', // Async invocation
					Payload: Buffer.from(JSON.stringify({
						pathParameters: { id: galleryId }
					}))
				}));
				logger.info('Delete gallery lambda invoked for expired gallery (fallback)', { galleryId });
				continue; // Skip warning emails for already-expired galleries
			} catch (invokeErr: any) {
				logger.error('Failed to invoke delete gallery lambda (fallback)', {
					error: invokeErr.message,
					galleryId,
					deleteFnName
				});
			}
		}
		
		const link = apiUrl ? `${apiUrl}/gallery/${galleryId}` : `https://your-frontend/gallery/${galleryId}`;
		const daysRemaining = Math.ceil((expiresAt - now) / (24 * 3600 * 1000));
		
		// Get owner email (from gallery or Cognito)
		const ownerEmail = await getOwnerEmail(item, userPoolId, logger);
		
		// 7-day warning (send if expires between now and 7 days from now, and not already sent)
		if (expiresAt > now && expiresAt <= sevenDaysFromNow && !expiryWarning7dSent) {
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
		
		// 24-hour warning (send if expires between now and 24 hours from now, and not already sent)
		if (expiresAt > now && expiresAt <= twentyFourHoursFromNow && !expiryWarning24hSent) {
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
		
		// Note: Gallery deletion is now handled automatically by DynamoDB TTL + Streams
		// This function only sends warning emails - no manual deletion needed
		// When TTL expires, DynamoDB automatically deletes the item and triggers the stream Lambda
	}
});


