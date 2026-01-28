import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getUserIdFromEvent } from '../../lib/src/auth';

const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!bucket) return { 
		statusCode: 500, 
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ error: 'Missing bucket' })
	};

	const body = event?.body ? JSON.parse(event.body) : {};
	const key = body?.key;
	const contentType = body?.contentType || 'image/png';
	const fileSize = body?.fileSize; // Optional file size in bytes

	if (!key) {
		return { 
			statusCode: 400, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'key is required' })
		};
	}

	// Get user ID from event
	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return { 
			statusCode: 401, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	// Store user watermarks in user-specific folder: users/{userId}/watermarks/{key}
	const objectKey = `users/${userId}/watermarks/${key}`;

	// Create PutObjectCommand
	const cmd = new PutObjectCommand({
		Bucket: bucket,
		Key: objectKey,
		ContentType: contentType
	});
	
	// Generate presigned URL
	const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ url, key: objectKey, expiresInSeconds: 3600 })
	};
});
