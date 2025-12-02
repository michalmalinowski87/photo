import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListPartsCommand } from '@aws-sdk/client-s3';
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

	// List all parts for the multipart upload
	const parts: Array<{ partNumber: number; etag: string; size: number }> = [];
	let partNumberMarker: number | undefined;

	do {
		const listCmd = new ListPartsCommand({
			Bucket: bucket,
			Key: key,
			UploadId: uploadId,
			PartNumberMarker: partNumberMarker,
		});

		const response = await s3.send(listCmd);

		if (response.Parts) {
			for (const part of response.Parts) {
				if (part.PartNumber && part.ETag && part.Size) {
					parts.push({
						partNumber: part.PartNumber,
						etag: part.ETag,
						size: part.Size,
					});
				}
			}
		}

		partNumberMarker = response.NextPartNumberMarker;
	} while (partNumberMarker);

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			parts,
			count: parts.length
		})
	};
});

