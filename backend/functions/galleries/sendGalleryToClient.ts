import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { createGalleryInvitationEmail, createGalleryPasswordEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const apiUrl = envProc?.env?.PUBLIC_GALLERY_URL as string || '';
	const sender = envProc?.env?.SENDER_EMAIL as string;
	
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

	const galleryLink = apiUrl ? `${apiUrl}/gallery/${galleryId}` : `https://your-frontend/gallery/${galleryId}`;
	const galleryName = gallery.galleryName || galleryId;
	const clientEmail = gallery.clientEmail;

	// Send invitation email
	try {
		const invitationTemplate = createGalleryInvitationEmail(galleryId, galleryName, clientEmail, galleryLink);
		
		logger.info('Sending SES email - Gallery Invitation', {
			from: sender,
			to: clientEmail,
			subject: invitationTemplate.subject,
			galleryId,
			galleryName
		});

		const invitationResult = await ses.send(new SendEmailCommand({
			Source: sender,
			Destination: { ToAddresses: [clientEmail] },
			Message: {
				Subject: { Data: invitationTemplate.subject },
				Body: {
					Text: { Data: invitationTemplate.text },
					Html: invitationTemplate.html ? { Data: invitationTemplate.html } : undefined
				}
			}
		}));

		logger.info('SES email sent successfully - Gallery Invitation', {
			messageId: invitationResult.MessageId,
			requestId: invitationResult.$metadata?.requestId,
			from: sender,
			to: clientEmail
		});
	} catch (err: any) {
		logger.error('SES send failed - Gallery Invitation Email', {
			error: {
				name: err.name,
				message: err.message,
				code: err.code,
				statusCode: err.$metadata?.httpStatusCode,
				requestId: err.$metadata?.requestId,
				stack: err.stack
			},
			galleryId,
			clientEmail
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to send invitation email', message: err.message })
		};
	}

	// Send password email (separate function call for future flexibility - e.g., SMS)
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
		logger.error('SES send failed - Gallery Password Email', {
			error: {
				name: err.name,
				message: err.message,
				code: err.code,
				statusCode: err.$metadata?.httpStatusCode,
				requestId: err.$metadata?.requestId,
				stack: err.stack
			},
			galleryId,
			clientEmail
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to send password email', message: err.message })
		};
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			galleryId, 
			sent: true, 
			clientEmail,
			invitationSent: true,
			passwordSent: true
		})
	};
});

