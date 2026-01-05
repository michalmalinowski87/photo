import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { pbkdf2Sync } from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { getSenderEmail } from '../../lib/src/email-config';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
// Configure S3Client with explicit region to ensure presigned URLs work correctly
// Presigned URLs require the client region to match the bucket region
const s3 = new S3Client({
	region: process.env.AWS_REGION || 'eu-west-1' // Default to eu-west-1 if AWS_REGION not set
});
const ses = new SESClient({});

function verifyPassword(password: string, hash?: string, salt?: string, iter?: number) {
	if (!hash || !salt || !iter) return false;
	const calc = pbkdf2Sync(password, salt, iter, 32, 'sha256').toString('hex');
	return calc === hash;
}

import { getSenderEmail } from '../../lib/src/email-config';

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const sender = await getSenderEmail();
	
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

	// Verify access: owner (Cognito) or client with password
	// Use verifyGalleryAccess for owner check, then fall back to password verification for clients
	const access = await verifyGalleryAccess(event, galleryId, gallery);
	let hasAccess = false;
	
	if (access.isOwner) {
		// Owner has access
		hasAccess = true;
	} else if (password && verifyPassword(password, gallery.clientPasswordHash, gallery.clientPasswordSalt, gallery.clientPasswordIter)) {
		// Client with correct password has access
		hasAccess = true;
	}

	if (!hasAccess) {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Forbidden', message: 'Access denied. You must be the gallery owner or provide the correct client password.' })
		};
	}

	try {
		// Find final assets or selected photos
		let photoKeys: string[] = [];
		
		// Check for final assets first - query DynamoDB
		const imagesTable = envProc?.env?.IMAGES_TABLE as string;
		if (imagesTable) {
			let allFinalImageRecords: any[] = [];
			let lastEvaluatedKey: any = undefined;

			do {
				const queryParams: any = {
					TableName: imagesTable,
					KeyConditionExpression: 'galleryId = :g',
					FilterExpression: '#type = :type',
					ExpressionAttributeNames: {
						'#type': 'type'
					},
					ExpressionAttributeValues: {
						':g': galleryId,
						':type': 'final'
					},
					ProjectionExpression: 'orderId, filename',
					Limit: 1000
				};

				if (lastEvaluatedKey) {
					queryParams.ExclusiveStartKey = lastEvaluatedKey;
				}

				const queryResponse = await ddb.send(new QueryCommand(queryParams));
				allFinalImageRecords.push(...(queryResponse.Items || []));
				lastEvaluatedKey = queryResponse.LastEvaluatedKey;
			} while (lastEvaluatedKey);

			if (allFinalImageRecords.length > 0) {
				// Format as orderId/filename to match expected format
				photoKeys = allFinalImageRecords.map(record => `${record.orderId}/${record.filename}`);
			}
		}
		
		if (photoKeys.length === 0) {
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

		// Fall back to selected photos from latest order if no final images found
		if (photoKeys.length === 0) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'No photos found to export' })
			};
		}

		// Generate presigned URLs (24 hour expiry)
		const urls = await Promise.all(photoKeys.map(async (key) => {
			// Determine S3 key based on whether it's a final image (orderId/filename) or selected key
			const s3Key = key.includes('/') 
				? `galleries/${galleryId}/final/${key}` 
				: `galleries/${galleryId}/originals/${key}`;
			let url = await getSignedUrl(
				s3,
				new GetObjectCommand({
					Bucket: bucket,
					Key: s3Key
					// Note: ChecksumMode is omitted entirely - AWS SDK may still add it by default
					// We'll manually remove it from the URL if present
				}),
				{ expiresIn: 86400 }
			);
			
			// Manually remove checksum mode parameter if present
			// AWS SDK v3 may add x-amz-checksum-mode=ENABLED by default, which causes 403 errors
			// if objects don't have checksums. Removing it ensures compatibility.
			if (url && url.includes('x-amz-checksum-mode')) {
				url = url.replace(/[&?]x-amz-checksum-mode=[^&]*/g, '');
				url = url.replace(/[&?]{2,}/g, (match) => match[0]);
				url = url.replace(/\?&/, '?');
				url = url.replace(/&$/, '');
			}
			
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
						Subject: { Data: `PhotoCloud Export: ${galleryDisplayName}` },
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
						subject: `PhotoCloud Export: ${galleryId}`,
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

