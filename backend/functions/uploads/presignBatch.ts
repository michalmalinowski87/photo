import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface BatchFileRequest {
	key: string;
	contentType?: string;
	fileSize?: number; // Required for originals
	// Optional: Request presigned URLs for thumbnails/previews (for client-side generation)
	includeThumbnails?: boolean; // If true, also generate presigned URLs for preview and thumbnail
}

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!bucket) return { statusCode: 500, body: 'Missing bucket' };

	const body = event?.body ? JSON.parse(event.body) : {};
	const galleryId = body?.galleryId;
	const files: BatchFileRequest[] = body?.files || [];

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
			const currentSize = gallery.originalsBytesUsed || 0;
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
			// Paid gallery - check against plan limit using DB
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

	// Generate presigned URLs for all files in parallel
	const presignedUrls = await Promise.all(
		files.map(async (file) => {
			const objectKey = `galleries/${galleryId}/${file.key}`;
			// Use Intelligent-Tiering for originals (served via CloudFront, no direct S3 access needed)
			const isOriginal = file.key.startsWith('originals/');
			const cmd = new PutObjectCommand({
				Bucket: bucket,
				Key: objectKey,
				ContentType: file.contentType || 'application/octet-stream',
				...(isOriginal && { 
					StorageClass: 'INTELLIGENT_TIERING',
					// Originals are immutable once uploaded - set long cache time for CloudFront
					// CloudFront will cache for 1 year, reducing origin requests and costs
					CacheControl: 'max-age=31536000, immutable'
				})
			});
			const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
			
			const result: {
				key: string;
				url: string;
				objectKey: string;
				expiresInSeconds: number;
				previewUrl?: string;
				previewKey?: string;
				thumbnailUrl?: string;
				thumbnailKey?: string;
			} = {
				key: file.key,
				url,
				objectKey,
				expiresInSeconds: 3600
			};

			// If client-side thumbnail generation is requested, also generate presigned URLs for preview and thumbnail
			if (file.includeThumbnails) {
				// Determine if this is an originals or finals upload
				const isOriginal = file.key.startsWith('originals/');
				const isFinal = file.key.startsWith('final/');
				
				if (isOriginal || isFinal) {
					// Extract filename from key
					// For originals: originals/{filename}
					// For finals: final/{orderId}/{filename}
					const keyParts = file.key.split('/');
					let filename: string;
					let previewKey: string;
					let bigThumbKey: string;
					let thumbKey: string;
					
					if (isOriginal) {
						filename = keyParts.slice(1).join('/'); // Remove 'originals/' prefix
						previewKey = `galleries/${galleryId}/previews/${filename}`;
						bigThumbKey = `galleries/${galleryId}/bigthumbs/${filename}`;
						thumbKey = `galleries/${galleryId}/thumbs/${filename}`;
					} else {
						// final/{orderId}/{filename}
						const orderId = keyParts[1];
						filename = keyParts.slice(2).join('/');
						previewKey = `galleries/${galleryId}/final/${orderId}/previews/${filename}`;
						bigThumbKey = `galleries/${galleryId}/final/${orderId}/bigthumbs/${filename}`;
						thumbKey = `galleries/${galleryId}/final/${orderId}/thumbs/${filename}`;
					}
					
					// Convert to WebP filenames
					const getWebpKey = (originalKey: string) => {
						const lastDot = originalKey.lastIndexOf('.');
						if (lastDot === -1) return `${originalKey}.webp`;
						return `${originalKey.substring(0, lastDot)}.webp`;
					};
					
					const previewWebpKey = getWebpKey(previewKey);
					const bigThumbWebpKey = getWebpKey(bigThumbKey);
					const thumbWebpKey = getWebpKey(thumbKey);
					
					// Generate presigned URLs for all three versions: preview, bigThumb, and thumbnail
					const [previewUrl, bigThumbUrl, thumbUrl] = await Promise.all([
						getSignedUrl(s3, new PutObjectCommand({
							Bucket: bucket,
							Key: previewWebpKey,
							ContentType: 'image/webp',
							CacheControl: 'max-age=31536000'
						}), { expiresIn: 3600 }),
						getSignedUrl(s3, new PutObjectCommand({
							Bucket: bucket,
							Key: bigThumbWebpKey,
							ContentType: 'image/webp',
							CacheControl: 'max-age=31536000'
						}), { expiresIn: 3600 }),
						getSignedUrl(s3, new PutObjectCommand({
							Bucket: bucket,
							Key: thumbWebpKey,
							ContentType: 'image/webp',
							CacheControl: 'max-age=31536000'
						}), { expiresIn: 3600 })
					]);
					
					result.previewUrl = previewUrl;
					result.previewKey = previewWebpKey.replace(`galleries/${galleryId}/`, '');
					result.bigThumbUrl = bigThumbUrl;
					result.bigThumbKey = bigThumbWebpKey.replace(`galleries/${galleryId}/`, '');
					result.thumbnailUrl = thumbUrl;
					result.thumbnailKey = thumbWebpKey.replace(`galleries/${galleryId}/`, '');
				}
			}
			
			return result;
		})
	);

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ 
			urls: presignedUrls,
			count: presignedUrls.length
		})
	};
});

