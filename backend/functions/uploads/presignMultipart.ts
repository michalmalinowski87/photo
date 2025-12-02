import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEFAULT_PART_SIZE = 5 * 1024 * 1024; // 5MB per part
const MIN_PART_SIZE = 5 * 1024 * 1024; // S3 minimum is 5MB (except last part)
const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024; // 5GB max per part

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

interface MultipartFileRequest {
	key: string;
	contentType?: string;
	fileSize: number;
	partSize?: number; // Optional custom part size
}

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!bucket) return { statusCode: 500, body: 'Missing bucket' };

	const body = event?.body ? JSON.parse(event.body) : {};
	const galleryId = body?.galleryId;
	const orderId = body?.orderId; // Optional, for finals uploads
	const files: MultipartFileRequest[] = body?.files || [];

	if (!galleryId || !Array.isArray(files) || files.length === 0) {
		return { 
			statusCode: 400, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId and files array are required' })
		};
	}

	// Limit batch size to prevent abuse (max 50 files per request)
	if (files.length > 50) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Batch size too large', message: 'Maximum 50 files per batch request' })
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

	const MAX_DRAFT_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB (largest plan)
	
	// Calculate total size for originals uploads
	let totalFileSize = 0;
	const originalsFiles = files.filter(f => f.key.startsWith('originals/'));
	
	if (originalsFiles.length > 0) {
		// Validate all originals have fileSize
		for (const file of originalsFiles) {
			if (file.fileSize === undefined || file.fileSize === null) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'fileSize required',
						message: `fileSize is required for originals upload: ${file.key}`
					})
				};
			}
			totalFileSize += file.fileSize;
		}

		// Check storage limits BEFORE upload
		if (!gallery.originalsLimitBytes) {
			// Draft gallery - limit to largest plan
			const currentSize = await calculateOriginalsSize(bucket, galleryId);
			if (currentSize + totalFileSize > MAX_DRAFT_SIZE_BYTES) {
				const usedGB = (currentSize / (1024 * 1024 * 1024)).toFixed(2);
				const limitGB = (MAX_DRAFT_SIZE_BYTES / (1024 * 1024 * 1024)).toFixed(0);
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Storage limit exceeded',
						message: `Cannot upload batch. Current usage: ${usedGB} GB / ${limitGB} GB. Please pay for gallery first to select a plan.`,
						currentSizeBytes: currentSize,
						limitBytes: MAX_DRAFT_SIZE_BYTES,
						totalFileSizeBytes: totalFileSize
					})
				};
			}
		} else {
			// Paid gallery - check against plan limit
			const currentSize = gallery.originalsBytesUsed || 0;
			if (currentSize + totalFileSize > gallery.originalsLimitBytes) {
				const usedMB = (currentSize / (1024 * 1024)).toFixed(2);
				const limitMB = (gallery.originalsLimitBytes / (1024 * 1024)).toFixed(2);
				const batchMB = (totalFileSize / (1024 * 1024)).toFixed(2);
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Storage limit exceeded',
						message: `Cannot upload batch (${batchMB} MB). Current usage: ${usedMB} MB / ${limitMB} MB. Please upgrade your plan.`,
						currentSizeBytes: currentSize,
						limitBytes: gallery.originalsLimitBytes,
						totalFileSizeBytes: totalFileSize
					})
				};
			}
		}
	}

	// Generate multipart uploads for all files
	const uploads = await Promise.all(
		files.map(async (file) => {
			const objectKey = orderId 
				? `galleries/${galleryId}/final/${orderId}/${file.key}`
				: `galleries/${galleryId}/${file.key}`;
			
			const contentType = file.contentType || 'application/octet-stream';
			const fileSize = file.fileSize;
			const partSize = file.partSize || DEFAULT_PART_SIZE;
			
			// Validate part size
			if (partSize < MIN_PART_SIZE || partSize > MAX_PART_SIZE) {
				throw new Error(`Part size must be between ${MIN_PART_SIZE} and ${MAX_PART_SIZE} bytes`);
			}

			// Calculate number of parts
			const totalParts = Math.ceil(fileSize / partSize);
			if (totalParts > 10000) {
				throw new Error('File too large: exceeds S3 maximum of 10,000 parts');
			}

			// Create multipart upload
			const createCmd = new CreateMultipartUploadCommand({
				Bucket: bucket,
				Key: objectKey,
				ContentType: contentType,
			});

			const createResponse = await s3.send(createCmd);
			const uploadId = createResponse.UploadId;

			if (!uploadId) {
				throw new Error('Failed to create multipart upload');
			}

			// Generate presigned URLs for each part
			const parts = [];
			for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
				const uploadPartCmd = new UploadPartCommand({
					Bucket: bucket,
					Key: objectKey,
					UploadId: uploadId,
					PartNumber: partNumber,
				});

				const partUrl = await getSignedUrl(s3, uploadPartCmd, { expiresIn: 3600 });
				parts.push({
					partNumber,
					url: partUrl,
				});
			}

			return {
				uploadId,
				key: file.key,
				objectKey,
				parts,
				totalParts,
				partSize,
			};
		})
	);

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			uploads,
			count: uploads.length
		})
	};
});

