import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { verifyGalleryAccess } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!galleriesTable || !bucket) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const filename = event?.pathParameters?.filename;

	if (!galleryId || !filename) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId and filename are required' })
		};
	}

	// Get gallery to verify access
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

	// Verify access: Only photographer (owner) can delete photos
	const access = verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner) {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Forbidden: Only gallery owner can delete photos' })
		};
	}

	// Construct S3 keys
	const originalKey = `galleries/${galleryId}/originals/${filename}`;
	const previewKey = `galleries/${galleryId}/previews/${filename}`;
	const thumbKey = `galleries/${galleryId}/thumbs/${filename}`;

	// Get original file size before deletion
	let fileSize = 0;
	try {
		const headResponse = await s3.send(new HeadObjectCommand({
			Bucket: bucket,
			Key: originalKey
		}));
		fileSize = headResponse.ContentLength || 0;
	} catch (err: any) {
		if (err.name !== 'NotFound') {
			logger.warn('Failed to get file size', { error: err.message, originalKey });
		}
	}

	// Delete from S3 (originals, previews, thumbs)
	const deleteResults = await Promise.allSettled([
		s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: originalKey })),
		s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: previewKey })),
		s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey }))
	]);

	const deleteErrors = deleteResults.filter(r => r.status === 'rejected');
	if (deleteErrors.length > 0) {
		logger.warn('Some files failed to delete', {
			errors: deleteErrors.map(e => (e as PromiseRejectedResult).reason),
			galleryId,
			filename
		});
	}

	// Update gallery bytesUsed by subtracting deleted file size
	if (fileSize > 0) {
		try {
			await ddb.send(new UpdateCommand({
				TableName: galleriesTable,
				Key: { galleryId },
				UpdateExpression: 'ADD bytesUsed :size',
				ExpressionAttributeValues: {
					':size': -fileSize
				}
			}));
			logger.info('Updated gallery bytesUsed', { galleryId, sizeRemoved: fileSize });
		} catch (updateErr: any) {
			logger.warn('Failed to update gallery bytesUsed', {
				error: updateErr.message,
				galleryId,
				size: fileSize
			});
		}
	}

	// Get updated gallery to return current storage usage
	const updatedGallery = await ddb.send(new GetCommand({
		TableName: galleriesTable,
		Key: { galleryId }
	}));

	const updatedBytesUsed = updatedGallery.Item?.bytesUsed || 0;
	const storageLimitBytes = updatedGallery.Item?.storageLimitBytes || 0;

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			message: 'Photo deleted successfully',
			galleryId,
			filename,
			bytesUsed: updatedBytesUsed,
			storageLimitBytes,
			storageUsedMB: (updatedBytesUsed / (1024 * 1024)).toFixed(2),
			storageLimitMB: (storageLimitBytes / (1024 * 1024)).toFixed(2)
		})
	};
});

