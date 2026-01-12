import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	
	if (!galleriesTable || !imagesTable || !bucket) {
		logger.error('Missing required environment variables', {
			hasGalleriesTable: !!galleriesTable,
			hasImagesTable: !!imagesTable,
			hasBucket: !!bucket
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const imageKeyParam = event?.pathParameters?.imageKey;
	
	if (!galleryId || !imageKeyParam) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or imageKey' })
		};
	}

	// Decode the imageKey (API Gateway URL-encodes path parameters)
	const filename = decodeURIComponent(imageKeyParam);
	
	// The imageKey in DynamoDB is stored as "original#{filename}" for original images
	// The frontend passes just the filename, so we need to construct the full imageKey
	const imageKey = `original#${filename}`;

	try {
		// Fetch gallery to verify access
		const galleryGet = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));

		const gallery = galleryGet.Item as any;
		if (!gallery) {
			logger.warn('Gallery not found', { galleryId });
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery not found' })
			};
		}

		// Verify gallery access (supports both owner and client tokens)
		const access = await verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			logger.warn('Unauthorized access attempt', { galleryId, filename });
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Unauthorized',
					message: 'Invalid or missing authentication token. Please log in again.'
				})
			};
		}

		// Fetch image to verify it belongs to this gallery
		const imageGet = await ddb.send(new GetCommand({
			TableName: imagesTable,
			Key: { 
				galleryId,
				imageKey
			}
		}));

		const image = imageGet.Item as any;
		if (!image) {
			logger.warn('Image not found in DynamoDB', { galleryId, filename, imageKey });
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Image not found',
					message: `Image "${filename}" not found in gallery "${galleryId}"`
				})
			};
		}

		// Generate presigned URL for the original image
		// Use s3Key from DynamoDB if available, otherwise construct it using filename
		const s3Key = image.s3Key || `galleries/${galleryId}/originals/${filename}`;
		
		// Use filename from DynamoDB record or the decoded filename
		const downloadFilename = image.filename || filename || 'image.jpg';
		
		// Create GetObjectCommand with Content-Disposition header to force download
		// This ensures browsers treat it as a download, not a display
		// The filename parameter ensures the correct filename is used when saving
		const command = new GetObjectCommand({
			Bucket: bucket,
			Key: s3Key,
			ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/"/g, '\\"')}"`
		});

		// Generate presigned URL (valid for 1 hour)
		const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				url: presignedUrl,
				filename: downloadFilename
			})
		};
	} catch (error: any) {
		logger.error('Download image failed', {
			error: {
				name: error.name,
				message: error.message,
				code: error.code,
				stack: error.stack
			},
			galleryId,
			filename,
			imageKey
		});
		return createLambdaErrorResponse(error, 'Failed to download image', 500);
	}
});
