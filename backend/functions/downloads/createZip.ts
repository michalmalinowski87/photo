import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import archiver from 'archiver';
import { Readable } from 'stream';

const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	if (!bucket) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing GALLERIES_BUCKET' })
		};
	}

	// Parse payload - can come from direct invoke or API Gateway
	let payload: { galleryId: string; keys: string[]; orderId: string };
	if (event.body) {
		payload = JSON.parse(event.body);
	} else {
		payload = event;
	}

	const { galleryId, keys, orderId } = payload;
	if (!galleryId || !keys || !Array.isArray(keys) || !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId, keys, or orderId' })
		};
	}

	const zipKey = `galleries/${galleryId}/zips/${orderId}.zip`;

	try {
		// Create ZIP archive
		const archive = archiver('zip', { zlib: { level: 9 } });
		const chunks: Buffer[] = [];

		archive.on('data', (chunk: Buffer) => {
			chunks.push(chunk);
		});

		// Stream each original file from S3 into the ZIP
		for (const key of keys) {
			const originalKey = `galleries/${galleryId}/originals/${key}`;
			try {
				const getObjectResponse = await s3.send(new GetObjectCommand({
					Bucket: bucket,
					Key: originalKey
				}));

				if (getObjectResponse.Body) {
					const stream = getObjectResponse.Body as Readable;
					// Read stream into buffer and append to archive
					const buffers: Buffer[] = [];
					for await (const chunk of stream) {
						buffers.push(Buffer.from(chunk));
					}
					const fileBuffer = Buffer.concat(buffers);
					archive.append(fileBuffer, { name: key });
				}
			} catch (err: any) {
				// Log but continue - some files might not exist
				console.error(`Failed to add ${originalKey} to ZIP:`, err.message);
			}
		}

		// Finalize the archive and wait for completion
		await new Promise<void>((resolve, reject) => {
			archive.on('end', () => resolve());
			archive.on('error', reject);
			archive.finalize();
		});

		// Combine chunks into single buffer
		const zipBuffer = Buffer.concat(chunks);

		// Upload ZIP to S3
		await s3.send(new PutObjectCommand({
			Bucket: bucket,
			Key: zipKey,
			Body: zipBuffer,
			ContentType: 'application/zip'
		}));

		// Generate presigned URL (24 hour expiry)
		const presignedUrl = await getSignedUrl(
			s3,
			new GetObjectCommand({
				Bucket: bucket,
				Key: zipKey
			}),
			{ expiresIn: 86400 }
		);

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				zipKey,
				url: presignedUrl,
				galleryId,
				orderId
			})
		};
	} catch (error: any) {
		console.error('ZIP generation failed:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'ZIP generation failed', message: error.message })
	};
	}
});
