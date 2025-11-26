import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function calculateOriginalsSize(bucket: string, galleryId: string): Promise<number> {
	let totalSize = 0;
	let continuationToken: string | undefined;
	const prefix = `galleries/${galleryId}/originals/`;

	do {
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			ContinuationToken: continuationToken
		}));

		if (listResponse.Contents) {
			totalSize += listResponse.Contents.reduce((sum, obj) => sum + (obj.Size || 0), 0);
		}

		continuationToken = listResponse.NextContinuationToken;
	} while (continuationToken);

	return totalSize;
}

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!bucket) return { statusCode: 500, body: 'Missing bucket' };

	const body = event?.body ? JSON.parse(event.body) : {};
	const galleryId = body?.galleryId;
	const key = body?.key;
	const contentType = body?.contentType || 'application/octet-stream';
	const fileSize = body?.fileSize; // Optional file size in bytes

	if (!galleryId || !key) {
		return { 
			statusCode: 400, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId and key are required' })
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

	// USER-CENTRIC FIX #4 & #12: Lock uploads if payment is in progress
	// This prevents user from uploading while payment is processing
	if (gallery.paymentLocked === true) {
		return {
			statusCode: 423,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Gallery locked',
				message: 'Cannot upload photos while payment is being processed. Please wait for payment to complete or cancel the payment to continue uploading.',
				paymentLocked: true
			})
		};
	}

	// Key format: galleries/{galleryId}/originals/{filename}
	const objectKey = `galleries/${galleryId}/${key}`;
	
	// Validate fileSize is provided for originals and check storage limits
	if (key.startsWith('originals/')) {
		if (fileSize === undefined || fileSize === null) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'fileSize required',
					message: 'fileSize is required when uploading to originals directory.'
				})
			};
		}

		// Check storage limits BEFORE upload
		// For draft galleries (no plan): limit to largest plan (10GB)
		// For paid galleries: check against originalsLimitBytes
		const MAX_DRAFT_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB (largest plan)
		
		if (!gallery.originalsLimitBytes) {
			// Draft gallery - limit to largest plan
			const currentSize = await calculateOriginalsSize(bucket, galleryId);
			if (currentSize + fileSize > MAX_DRAFT_SIZE_BYTES) {
				const usedGB = (currentSize / (1024 * 1024 * 1024)).toFixed(2);
				const limitGB = (MAX_DRAFT_SIZE_BYTES / (1024 * 1024 * 1024)).toFixed(0);
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Storage limit exceeded',
						message: `Cannot upload more than ${limitGB} GB to unpaid draft gallery. Current usage: ${usedGB} GB. Please pay for gallery first to select a plan.`,
						currentSizeBytes: currentSize,
						limitBytes: MAX_DRAFT_SIZE_BYTES,
						fileSizeBytes: fileSize
					})
				};
			}
		} else {
			// Paid gallery - check against plan limit
			const currentSize = gallery.originalsBytesUsed || 0;
			if (currentSize + fileSize > gallery.originalsLimitBytes) {
				const usedMB = (currentSize / (1024 * 1024)).toFixed(2);
				const limitMB = (gallery.originalsLimitBytes / (1024 * 1024)).toFixed(2);
				const fileMB = (fileSize / (1024 * 1024)).toFixed(2);
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Storage limit exceeded',
						message: `Cannot upload ${fileMB} MB. Current usage: ${usedMB} MB / ${limitMB} MB. Please upgrade your plan.`,
						currentSizeBytes: currentSize,
						limitBytes: gallery.originalsLimitBytes,
						fileSizeBytes: fileSize
					})
				};
			}
		}
	}

	const cmd = new PutObjectCommand({
		Bucket: bucket,
		Key: objectKey,
		ContentType: contentType
	});
	const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ url, key: objectKey, expiresInSeconds: 3600 })
	};
});

