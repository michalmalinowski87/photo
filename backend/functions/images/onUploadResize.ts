import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import sharp from 'sharp';
import { Readable } from 'stream';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function streamToBuffer(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	if (!bucket) {
		logger?.error('Missing GALLERIES_BUCKET');
		return;
	}
	
	logger?.info('Resize Lambda triggered', { recordCount: event.Records?.length || 0 });

	// Process images in parallel batches for better performance
	const records = event.Records ?? [];
	const BATCH_SIZE = 3; // Process 3 images concurrently to balance memory and speed
	
	for (let i = 0; i < records.length; i += BATCH_SIZE) {
		const batch = records.slice(i, i + BATCH_SIZE);
		await Promise.allSettled(batch.map(rec => processImage(rec, bucket, galleriesTable, logger)));
	}
});

async function processImage(rec: any, bucket: string, galleriesTable: string | undefined, logger: any) {
	const rawKey = rec.s3?.object?.key || '';
	if (!rawKey) {
		logger?.error('No key in S3 event', { record: rec });
		return;
	}

	// S3 event keys are URL-encoded, decode them
	// Note: decodeURIComponent doesn't decode '+' as space, so we need to handle that
	// Replace '+' with '%20' before decoding (since '+' in URLs typically means space)
	let key: string;
	try {
		// Replace '+' with '%20' to handle URL-encoded spaces properly
		const keyToDecode = rawKey.replace(/\+/g, '%20');
		key = decodeURIComponent(keyToDecode);
	} catch (e) {
		// If decoding fails, use raw key
		logger?.warn('Failed to decode key, using raw key', { rawKey, error: e });
		key = rawKey;
	}

	// Process files in originals/ or final/
	const isOriginal = key.includes('/originals/');
	const isFinal = key.includes('/final/');
	if (!isOriginal && !isFinal) return;

	// Key format: galleries/{galleryId}/originals/{filename} or galleries/{galleryId}/final/{orderId}/{filename}
	const parts = key.split('/');
	if (parts.length < 4 || parts[0] !== 'galleries') {
		logger?.error('Invalid key format', { key, rawKey });
		return;
	}
		
		const galleryId = parts[1];
		let filename: string;
		let previewKey: string;
		let thumbKey: string;
		
		if (isOriginal) {
			// galleries/{galleryId}/originals/{filename}
			filename = parts.slice(3).join('/');
			previewKey = `galleries/${galleryId}/previews/${filename}`;
			thumbKey = `galleries/${galleryId}/thumbs/${filename}`;
		} else {
			// galleries/{galleryId}/final/{orderId}/{filename}
			const orderId = parts[3];
			filename = parts.slice(4).join('/');
			previewKey = `galleries/${galleryId}/final/${orderId}/previews/${filename}`;
			thumbKey = `galleries/${galleryId}/final/${orderId}/thumbs/${filename}`;
		}
		
		// Generate WebP filenames (replace extension with .webp)
		const getWebpKey = (originalKey: string) => {
			const lastDot = originalKey.lastIndexOf('.');
			if (lastDot === -1) return `${originalKey}.webp`;
			return `${originalKey.substring(0, lastDot)}.webp`;
		};
		
		const previewWebpKey = getWebpKey(previewKey);
		const thumbWebpKey = getWebpKey(thumbKey);

		logger?.info('Processing image', { key, rawKey, galleryId, previewWebpKey, thumbWebpKey });

		try {
			// Download original from S3
			// Try decoded key first, fallback to raw key if it fails
			let getObjectResponse;
			try {
				getObjectResponse = await s3.send(new GetObjectCommand({
					Bucket: bucket,
					Key: key
				}));
			} catch (keyError: any) {
				if (keyError.name === 'NoSuchKey' && key !== rawKey) {
					logger?.warn('Decoded key not found, trying raw key', { key, rawKey });
					getObjectResponse = await s3.send(new GetObjectCommand({
						Bucket: bucket,
						Key: rawKey
					}));
					// Update key to rawKey for rest of processing
					key = rawKey;
				} else {
					throw keyError;
				}
			}

		if (!getObjectResponse.Body) {
			logger?.error('No body for image', { key });
			return;
		}

		const imageStream = getObjectResponse.Body as Readable;
		const imageBuffer = await streamToBuffer(imageStream);

		// Load image metadata with Sharp to get dimensions
		let imageMetadata: sharp.Metadata;
		try {
			imageMetadata = await sharp(imageBuffer).metadata();
		} catch (err: any) {
			logger?.info('Skipping non-image file', { key, error: err.message });
			return;
		}

		const width = imageMetadata.width || 0;
		const height = imageMetadata.height || 0;
		logger?.info('Image loaded', { width, height });
		
		// Calculate dimensions maintaining aspect ratio (fit inside, no enlargement)
		const calculateDimensions = (maxSize: number) => {
			if (width <= maxSize && height <= maxSize) {
				return { width, height };
			}
			const ratio = Math.min(maxSize / width, maxSize / height);
			return {
				width: Math.round(width * ratio),
				height: Math.round(height * ratio)
			};
		};

		const previewDims = calculateDimensions(1200);
		const thumbDims = calculateDimensions(200);
		logger?.info('Calculated dimensions', { 
			preview: previewDims, 
			thumb: thumbDims,
			original: { width, height }
		});

		// Generate preview and thumbnail in WebP format only
		logger?.info('Starting resize operations');
		const [previewWebpBuffer, thumbWebpBuffer] = await Promise.all([
			sharp(imageBuffer)
				.resize(previewDims.width, previewDims.height, { fit: 'inside', withoutEnlargement: true })
				.webp({ quality: 85 })
				.toBuffer(),
			sharp(imageBuffer)
				.resize(thumbDims.width, thumbDims.height, { fit: 'inside', withoutEnlargement: true })
				.webp({ quality: 80 })
				.toBuffer()
		]);

		logger?.info('Resize complete', { 
			previewWebpSize: previewWebpBuffer.length,
			thumbWebpSize: thumbWebpBuffer.length
		});

		// Upload preview and thumbnail in WebP format to S3
		logger?.info('Uploading to S3', { previewWebpKey, thumbWebpKey });
		await Promise.all([
			s3.send(new PutObjectCommand({
				Bucket: bucket,
				Key: previewWebpKey,
				Body: previewWebpBuffer,
				ContentType: 'image/webp',
				CacheControl: 'max-age=31536000'
			})),
			s3.send(new PutObjectCommand({
				Bucket: bucket,
				Key: thumbWebpKey,
				Body: thumbWebpBuffer,
				ContentType: 'image/webp',
				CacheControl: 'max-age=31536000'
			}))
		]);

		logger?.info('Image processed successfully', { 
			key, 
			previewWebpKey,
			thumbWebpKey,
			previewWebpSizeBytes: previewWebpBuffer.length,
			thumbWebpSizeBytes: thumbWebpBuffer.length,
			originalSizeBytes: imageBuffer.length
		});

		// Update gallery bytes used based on type
		if (galleriesTable && imageBuffer.length > 0) {
			try {
				if (isOriginal) {
					// Update originalsBytesUsed for originals
					await ddb.send(new UpdateCommand({
						TableName: galleriesTable,
						Key: { galleryId },
						UpdateExpression: 'ADD originalsBytesUsed :size, bytesUsed :size',
						ExpressionAttributeValues: {
							':size': imageBuffer.length
						}
					}));
					logger?.info('Updated gallery originalsBytesUsed', { galleryId, sizeAdded: imageBuffer.length });
				} else {
					// Update finalsBytesUsed for finals
					await ddb.send(new UpdateCommand({
						TableName: galleriesTable,
						Key: { galleryId },
						UpdateExpression: 'ADD finalsBytesUsed :size',
						ExpressionAttributeValues: {
							':size': imageBuffer.length
						}
					}));
					logger?.info('Updated gallery finalsBytesUsed', { galleryId, sizeAdded: imageBuffer.length });
				}
			} catch (updateErr: any) {
				logger?.warn('Failed to update gallery bytes used', {
					error: updateErr.message,
					galleryId,
					size: imageBuffer.length,
					type: isOriginal ? 'originals' : 'finals'
				});
			}
		}
		} catch (e: any) {
			// Log error but continue processing other files
			logger?.error('Failed to process image', {
				error: {
					name: e.name,
					message: e.message,
					stack: e.stack
				},
				key,
				galleryId,
				previewKey,
				thumbKey
			});
		// Optionally, fallback to copying original if resize fails
		try {
			const fallbackGet = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
			if (fallbackGet.Body) {
				const fallbackBuffer = await streamToBuffer(fallbackGet.Body as Readable);
				// Convert to WebP as fallback
				const fallbackWebpBuffer = await sharp(fallbackBuffer)
					.webp({ quality: 85 })
					.toBuffer();
				// Generate WebP filename for fallback
				const getWebpKey = (originalKey: string) => {
					const lastDot = originalKey.lastIndexOf('.');
					if (lastDot === -1) return `${originalKey}.webp`;
					return `${originalKey.substring(0, lastDot)}.webp`;
				};
				const fallbackPreviewKey = getWebpKey(previewKey);
				await s3.send(new PutObjectCommand({
					Bucket: bucket,
					Key: fallbackPreviewKey,
					Body: fallbackWebpBuffer,
					ContentType: 'image/webp'
				}));
				logger?.info('Fallback WebP conversion succeeded', { key, fallbackPreviewKey });
			}
		} catch (fallbackErr: any) {
			logger?.error('Fallback WebP conversion failed', {
				error: {
					name: fallbackErr.name,
					message: fallbackErr.message
				},
				key,
				previewKey
			});
		}
		}
	}


