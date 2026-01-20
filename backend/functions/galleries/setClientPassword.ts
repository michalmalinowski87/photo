import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { createPasswordResetEmail } from '../../lib/src/email';
import { getSenderEmail } from '../../lib/src/email-config';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';
import {
	encryptClientGalleryPassword,
	getGalleryPasswordEncryptionSecret,
	hashClientGalleryPassword,
} from '../../lib/src/client-gallery-password';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
// Use require to avoid type resolution requirement during lint without installed types
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const ses = new SESClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE || 'dev';
	const table = envProc?.env?.GALLERIES_TABLE as string;
	const sender = await getSenderEmail();
	if (!table) return { statusCode: 500, body: 'Missing table' };
	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: 'missing id' };
	const body = event?.body ? JSON.parse(event.body) : {};
	const newPassword: string | undefined = body?.password;
	const clientEmail: string | undefined = body?.clientEmail;
	if (!newPassword || !clientEmail) {
		return { statusCode: 400, body: 'password and clientEmail are required' };
	}

	const requester = getUserIdFromEvent(event);
	const got = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId: id } }));
	const gallery = got.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	requireOwnerOr403(gallery.ownerId, requester);

	// Trim password to ensure consistency with create.ts and clientLogin.ts
	const passwordPlain = typeof newPassword === 'string' ? newPassword.trim() : newPassword;
	const emailPlain = typeof clientEmail === 'string' ? clientEmail.trim() : clientEmail;
	
	if (!passwordPlain || !emailPlain) {
		return { statusCode: 400, body: 'password and clientEmail cannot be empty after trimming' };
	}

	const secrets = hashClientGalleryPassword(passwordPlain);
	const encSecret = await getGalleryPasswordEncryptionSecret(stage);
	if (!encSecret) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				error: 'Missing GalleryPasswordEncryptionSecret',
				message:
					'Gallery password encryption secret is not configured. Set SSM /PhotoHub/<stage>/GalleryPasswordEncryptionSecret or env GALLERY_PASSWORD_ENCRYPTION_SECRET.',
			}),
		};
	}
	const encrypted = encryptClientGalleryPassword(passwordPlain, encSecret);
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
	const base = galleryUrl.replace(/\/+$/, '');
	const galleryLink = `${base}/${id}`;
	
	await ddb.send(new UpdateCommand({
		TableName: table,
		Key: { galleryId: id },
		UpdateExpression: 'SET clientPasswordHash = :h, clientPasswordSalt = :s, clientPasswordIter = :i, clientEmail = :e, clientPasswordEncrypted = :enc, updatedAt = :u',
		ExpressionAttributeValues: {
			':h': secrets.hashHex,
			':s': secrets.saltHex,
			':i': secrets.iterations,
			':e': emailPlain,
			':enc': encrypted,
			':u': new Date().toISOString()
		}
	}));

	// Send password reset email with gallery link
	if (sender && clientEmail) {
		const galleryDisplayName = gallery.galleryName || id;
		const emailTemplate = createPasswordResetEmail(id, galleryDisplayName, clientEmail, newPassword, galleryLink);
		
		try {
			logger.info('Sending SES email - Password Reset', {
				from: sender,
				to: clientEmail,
				subject: emailTemplate.subject,
				galleryId: id,
				galleryName: galleryDisplayName
			});
			const result = await ses.send(new SendEmailCommand({
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
			logger.info('SES email sent successfully - Password Reset', {
				messageId: result.MessageId,
				requestId: result.$metadata?.requestId,
				from: sender,
				to: clientEmail
			});
		} catch (e: any) {
			// Log only; do not fail password change due to email issues
			logger.error('SES send failed - Password Reset Email', {
				error: {
					name: e.name,
					message: e.message,
					code: e.code,
					statusCode: e.$metadata?.httpStatusCode,
					requestId: e.$metadata?.requestId,
					stack: e.stack
				},
				emailDetails: {
					from: sender,
					to: clientEmail,
					subject: emailTemplate.subject,
					galleryId: id
				},
				envCheck: {
					senderConfigured: !!sender
				}
			});
		}
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ galleryId: id, clientEmail: emailPlain })
	};
});

