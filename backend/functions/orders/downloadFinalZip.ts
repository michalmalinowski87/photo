import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';
import { Readable } from 'stream';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;

	if (!bucket || !galleriesTable || !ordersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or orderId' })
		};
	}

	try {
		// Verify gallery exists
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

		// Verify access - supports both owner (Cognito) and client (JWT) tokens
		const access = verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
			};
		}

		// Verify order exists and is DELIVERED or PREPARING_DELIVERY
		const orderGet = await ddb.send(new GetCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId }
		}));
		const order = orderGet.Item as any;
		if (!order) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Order not found' })
			};
		}
		if (order.deliveryStatus !== 'DELIVERED' && order.deliveryStatus !== 'PREPARING_DELIVERY') {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Order is not delivered or preparing delivery' })
			};
		}

		// List final images for this order
		// Final images are stored at: galleries/{galleryId}/final/{orderId}/{filename}
		const prefix = `galleries/${galleryId}/final/${orderId}/`;
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix
		}));

		if (!listResponse.Contents || listResponse.Contents.length === 0) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'No final images found for this order' })
			};
		}

		// Create ZIP archive
		const archive = archiver('zip', { zlib: { level: 9 } });
		const chunks: Buffer[] = [];

		archive.on('data', (chunk: Buffer) => {
			chunks.push(chunk);
		});

		// Stream each final file from S3 into the ZIP
		for (const obj of listResponse.Contents) {
			const fullKey = obj.Key || '';
			const filename = fullKey.replace(prefix, '');
			if (!filename) continue;

			try {
				const getObjectResponse = await s3.send(new GetObjectCommand({
					Bucket: bucket,
					Key: fullKey
				}));

				if (getObjectResponse.Body) {
					const stream = getObjectResponse.Body as Readable;
					const buffers: Buffer[] = [];
					for await (const chunk of stream) {
						buffers.push(Buffer.from(chunk));
					}
					const fileBuffer = Buffer.concat(buffers);
					archive.append(fileBuffer, { name: filename });
				}
			} catch (err: any) {
				console.error(`Failed to add ${fullKey} to ZIP:`, err.message);
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

		// Return ZIP as binary (base64-encoded for API Gateway)
		const filename = `gallery-${galleryId}-order-${orderId}-final.zip`;
		
		return {
			statusCode: 200,
			headers: {
				'content-type': 'application/zip',
				'content-disposition': `attachment; filename="${filename}"`,
				'content-length': zipBuffer.length.toString()
			},
			body: zipBuffer.toString('base64'),
			isBase64Encoded: true
		};
	} catch (error: any) {
		console.error('Final ZIP generation failed:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'ZIP generation failed', message: error.message })
		};
	}
});

