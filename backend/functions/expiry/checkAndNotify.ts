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
	
	const res = await ddb.send(new ScanCommand({ TableName: galleriesTable }));
	
	for (const item of res.Items ?? []) {
		const galleryId = item.galleryId as string;
		const galleryName = item.galleryName as string | undefined;
		const clientEmail = item.clientEmail as string | undefined;
		const expiresAt = item.expiresAt ? Date.parse(item.expiresAt as string) : undefined;
		const expiryWarning7dSent = item.expiryWarning7dSent as boolean | undefined;
		const expiryWarning24hSent = item.expiryWarning24hSent as boolean | undefined;
		
		if (!expiresAt) continue;
		
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
		
		// Auto-delete when expired
		if (expiresAt <= now && deleteFnName) {
			try {
				logger.info('Invoking delete gallery lambda for expired gallery', { galleryId });
				await lambda.send(new InvokeCommand({
					FunctionName: deleteFnName,
					InvocationType: 'Event', // Async invocation
					Payload: Buffer.from(JSON.stringify({
						pathParameters: { id: galleryId }
					}))
				}));
				logger.info('Delete gallery lambda invoked', { galleryId });
			} catch (invokeErr: any) {
				logger.error('Failed to invoke delete gallery lambda', {
					error: invokeErr.message,
					galleryId,
					deleteFnName
				});
			}
		}
	}
});


