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

		archive.on('error', (err: Error) => {
			console.error('Archive error:', err);
			throw err;
		});

		// Helper function to validate and add a file to the ZIP
		const addFileToZip = async (s3Key: string, zipFilename: string): Promise<boolean> => {
			try {
				const getObjectResponse = await s3.send(new GetObjectCommand({
					Bucket: bucket,
					Key: s3Key
				}));

				// Defensive check: file must exist and have a body
				if (!getObjectResponse.Body) {
					console.warn(`Skipping ${s3Key}: no body in S3 response`);
					return false;
				}

				// Defensive check: file must have non-zero size
				const contentLength = getObjectResponse.ContentLength || 0;
				if (contentLength === 0) {
					console.warn(`Skipping ${s3Key}: file size is 0`);
					return false;
				}

				// Read file into buffer
				const stream = getObjectResponse.Body as Readable;
				const buffers: Buffer[] = [];
				for await (const chunk of stream) {
					buffers.push(Buffer.from(chunk));
				}
				const fileBuffer = Buffer.concat(buffers);

				// Defensive check: verify buffer size matches expected size and is not empty
				if (fileBuffer.length === 0) {
					console.warn(`Skipping ${s3Key}: file buffer is empty`);
					return false;
				}

				// Add to ZIP
				archive.append(fileBuffer, { name: zipFilename });
				console.log(`Added ${zipFilename} to ZIP (${fileBuffer.length} bytes)`);
				return true;
			} catch (err: any) {
				// Handle file not found or other errors gracefully
				if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
					console.warn(`Skipping ${s3Key}: file not found`);
				} else {
					console.error(`Failed to add ${s3Key} to ZIP:`, {
						error: err.message,
						name: err.name,
						code: err.code
					});
				}
				return false;
			}
		};

		// Process each final file
		// CRITICAL: Exclude previews/ and thumbs/ subdirectories - only include actual final images
		let filesAdded = 0;
		for (const obj of listResponse.Contents) {
			const fullKey = obj.Key || '';
			const filename = fullKey.replace(prefix, '');
			
			// Skip empty filenames
			if (!filename) continue;

			// Skip previews and thumbnails - only include files directly under final/{orderId}/
			if (filename.includes('/previews/') || filename.includes('/thumbs/') || filename.includes('/')) {
				continue;
			}

			// Add file to ZIP
			if (await addFileToZip(fullKey, filename)) {
				filesAdded++;
			}
		}

		// Ensure at least one file was added
		if (filesAdded === 0) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'No valid final images found to include in ZIP' })
			};
		}

		// Finalize the archive and wait for completion
		const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
			archive.once('end', () => {
				const buffer = Buffer.concat(chunks);
				console.log('Final ZIP created', {
					filesAdded,
					zipSize: buffer.length
				});
				resolve(buffer);
			});
			
			archive.once('error', reject);
			archive.finalize();
		});

		// Validate ZIP buffer
		if (zipBuffer.length === 0) {
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'ZIP archive is empty' })
			};
		}

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

