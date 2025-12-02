import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!bucket) return { statusCode: 500, body: 'Missing bucket' };

	const body = event?.body ? JSON.parse(event.body) : {};
	const galleryId = body?.galleryId;
	const uploadId = body?.uploadId;
	const key = body?.key; // Full S3 key (objectKey)

	if (!galleryId || !uploadId || !key) {
		return { 
			statusCode: 400, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId, uploadId, and key are required' })
		};
	}

	// Enforce owner-only access
	const table = envProc?.env?.GALLERIES_TABLE as string;
	if (!table) return { 
		statusCode: 500, 
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ error: 'Missing table' })
	};
	const requester = getUserIdFromEvent(event);
	const got = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId } }));
	const gallery = got.Item as any;
	if (!gallery) return { 
		statusCode: 404, 
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ error: 'not found' })
	};
	requireOwnerOr403(gallery.ownerId, requester);

	// Abort multipart upload
	const abortCmd = new AbortMultipartUploadCommand({
		Bucket: bucket,
		Key: key,
		UploadId: uploadId,
	});

	try {
		await s3.send(abortCmd);
		
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				success: true,
				message: 'Multipart upload aborted successfully'
			})
		};
	} catch (error: any) {
		// If upload doesn't exist or already aborted, that's okay
		if (error.name === 'NoSuchUpload') {
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					success: true,
					message: 'Upload already aborted or does not exist'
				})
			};
		}

		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to abort multipart upload',
				message: error.message || 'Unknown error'
			})
		};
	}
});

