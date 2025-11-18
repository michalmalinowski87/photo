import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { pbkdf2Sync } from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESClient({});

function verifyPassword(password: string, hash?: string, salt?: string, iter?: number) {
	if (!hash || !salt || !iter) return false;
	const calc = pbkdf2Sync(password, salt, iter, 32, 'sha256').toString('hex');
	return calc === hash;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const sender = envProc?.env?.SENDER_EMAIL as string;
	
	if (!galleriesTable || !bucket) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'missing id' })
		};
	}

	const body = event?.body ? JSON.parse(event.body) : {};
	const password = body?.password;
	const requester = event?.requestContext?.authorizer?.jwt?.claims?.sub;

	// Get gallery
	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}

	// Verify access: owner or client with password
	let hasAccess = false;
	if (requester && gallery.ownerId === requester) {
		hasAccess = true;
	} else if (password && verifyPassword(password, gallery.clientPasswordHash, gallery.clientPasswordSalt, gallery.clientPasswordIter)) {
		hasAccess = true;
	}

	if (!hasAccess) {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Forbidden' })
		};
	}

	try {
		// Find final assets or selected photos
		let photoKeys: string[] = [];
		
		// Check for final assets first
		const finalPrefix = `galleries/${galleryId}/final/`;
		const finalList = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: finalPrefix
		}));
		
		if (finalList.Contents && finalList.Contents.length > 0) {
			photoKeys = finalList.Contents.map(obj => obj.Key!.replace(finalPrefix, ''));
		} else {
			// Fall back to selected photos from latest order
			if (ordersTable && gallery.currentOrderId) {
				const order = await ddb.send(new GetCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId: gallery.currentOrderId }
				}));
				if (order.Item) {
					photoKeys = order.Item.selectedKeys || [];
				}
			}
		}

		if (photoKeys.length === 0) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'No photos found to export' })
			};
		}

		// Generate presigned URLs (24 hour expiry)
		const urls = await Promise.all(photoKeys.map(async (key) => {
			const s3Key = finalPrefix + key;
			const url = await getSignedUrl(
				s3,
				new GetObjectCommand({
					Bucket: bucket,
					Key: s3Key
				}),
				{ expiresIn: 86400 }
			);
			return {
				filename: key,
				url,
				expiresAt: new Date(Date.now() + 86400 * 1000).toISOString()
			};
		}));

		// Create manifest
		const manifest = {
			galleryId,
			galleryName: gallery.name || galleryId,
			exportedAt: new Date().toISOString(),
			photoCount: urls.length,
			photos: urls,
			instructions: {
				googlePhotos: '1. Download all photos using the URLs in the manifest\n2. Go to photos.google.com\n3. Click "Upload" and select the downloaded photos',
				applePhotos: '1. Download all photos using the URLs in the manifest\n2. Open Photos app on Mac\n3. File > Import and select the downloaded photos'
			}
		};

		// Send email with manifest if client email is available
		if (sender && gallery.clientEmail) {
			try {
				const manifestJson = JSON.stringify(manifest, null, 2);
				const galleryDisplayName = gallery.galleryName || galleryId;
				logger.info('Sending SES email - Export', {
					from: sender,
					to: gallery.clientEmail,
					galleryId,
					galleryName: galleryDisplayName,
					photoCount: urls.length
				});
				const result = await ses.send(new SendEmailCommand({
					Source: sender,
					Destination: { ToAddresses: [gallery.clientEmail] },
					Message: {
						Subject: { Data: `PhotoHub Export: ${galleryDisplayName}` },
						Body: {
							Text: { 
								Data: `Your photo export is ready!\n\nGallery: ${galleryDisplayName}\nPhotos: ${urls.length}\n\nManifest (JSON):\n${manifestJson}\n\nAll URLs expire in 24 hours.`
							},
							Html: {
								Data: `<h2>Your photo export is ready!</h2><p>Gallery: <strong>${galleryDisplayName}</strong></p><p>Photos: <strong>${urls.length}</strong></p><pre style="background: #f5f5f5; padding: 12px; overflow-x: auto;">${manifestJson}</pre><p><small>All URLs expire in 24 hours.</small></p>`
							}
						}
					}
				}));
				logger.info('SES email sent successfully - Export', {
					messageId: result.MessageId,
					requestId: result.$metadata?.requestId,
					from: sender,
					to: gallery.clientEmail,
					galleryId
				});
			} catch (emailErr: any) {
				logger.error('SES send failed - Export Email', {
					error: {
						name: emailErr.name,
						message: emailErr.message,
						code: emailErr.code,
						statusCode: emailErr.$metadata?.httpStatusCode,
						requestId: emailErr.$metadata?.requestId,
						stack: emailErr.stack
					},
					emailDetails: {
						from: sender,
						to: gallery.clientEmail,
						subject: `PhotoHub Export: ${galleryId}`,
						galleryId,
						photoCount: urls.length
					},
					envCheck: {
						senderConfigured: !!sender,
						clientEmailConfigured: !!gallery.clientEmail
					}
				});
			}
		}

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				message: 'Export manifest generated',
				manifest,
				emailSent: !!(sender && gallery.clientEmail)
			})
		};
	} catch (error: any) {
		console.error('Export failed:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Export failed', message: error.message })
		};
	}
});

