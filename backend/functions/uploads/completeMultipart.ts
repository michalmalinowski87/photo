import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface Part {
	partNumber: number;
	etag: string;
}

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!bucket) return { statusCode: 500, body: 'Missing bucket' };

	const body = event?.body ? JSON.parse(event.body) : {};
	const galleryId = body?.galleryId;
	const uploadId = body?.uploadId;
	const key = body?.key; // Full S3 key (objectKey)
	const parts: Part[] = body?.parts || [];

	if (!galleryId || !uploadId || !key || !Array.isArray(parts) || parts.length === 0) {
		return { 
			statusCode: 400, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId, uploadId, key, and parts array are required' })
		};
	}

	// Validate parts array
	if (parts.length > 10000) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Too many parts', message: 'Maximum 10,000 parts allowed' })
		};
	}

	// Enforce owner-only upload
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

	// Sort parts by part number and validate
	const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);
	
	// Validate part numbers are sequential starting from 1
	for (let i = 0; i < sortedParts.length; i++) {
		if (sortedParts[i].partNumber !== i + 1) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Invalid part numbers',
					message: 'Part numbers must be sequential starting from 1'
				})
			};
		}
	}

	// Complete multipart upload
	const completeCmd = new CompleteMultipartUploadCommand({
		Bucket: bucket,
		Key: key,
		UploadId: uploadId,
		MultipartUpload: {
			Parts: sortedParts.map(part => ({
				PartNumber: part.partNumber,
				ETag: part.etag,
			})),
		},
	});

	try {
		const response = await s3.send(completeCmd);
		
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				success: true,
				key: response.Key,
				etag: response.ETag,
				location: response.Location,
			})
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to complete multipart upload',
				message: error.message || 'Unknown error'
			})
		};
	}
});

