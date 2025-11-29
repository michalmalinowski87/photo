import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import archiver from 'archiver';
import { Readable } from 'stream';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, _context: any) => {
	console.log('ZIP generation Lambda invoked', {
		eventType: typeof event,
		hasBody: !!event.body,
		eventKeys: Object.keys(event),
		eventPreview: JSON.stringify(event).substring(0, 200)
	});
	
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	if (!bucket) {
		console.error('Missing GALLERIES_BUCKET environment variable');
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing GALLERIES_BUCKET' })
		};
	}

	// Parse payload - can come from direct invoke or API Gateway
	let payload: { galleryId: string; keys: string[]; orderId: string };
	try {
		if (event.body) {
			payload = JSON.parse(event.body);
		} else {
			payload = event;
		}
	} catch (parseErr: any) {
		console.error('Failed to parse event payload', {
			error: parseErr.message,
			event: JSON.stringify(event).substring(0, 500)
		});
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Invalid payload format', message: parseErr.message })
		};
	}

	const { galleryId, keys, orderId } = payload;
	console.log('ZIP generation started', {
		galleryId,
		orderId,
		keysCount: keys?.length || 0,
		hasKeys: !!keys,
		isArray: Array.isArray(keys)
	});
	
	if (!galleryId || !keys || !Array.isArray(keys) || !orderId) {
		console.error('Missing required fields', {
			hasGalleryId: !!galleryId,
			hasKeys: !!keys,
			keysIsArray: Array.isArray(keys),
			keysLength: keys?.length,
			hasOrderId: !!orderId,
			payload
		});
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId, keys, or orderId' })
		};
	}

	const zipKey = `galleries/${galleryId}/zips/${orderId}.zip`;

	try {
		// Create ZIP archive
		const archive = archiver('zip', { 
			zlib: { level: 9 },
			store: false // Use compression (default)
		});
		const chunks: Buffer[] = [];
		let filesAdded = 0;
		let totalBytesAdded = 0;

		// Set up data handler BEFORE any operations
		archive.on('data', (chunk: Buffer) => {
			chunks.push(chunk);
		});

		// Set up error handler
		archive.on('error', (err: Error) => {
			console.error('Archive error:', err);
			throw err;
		});

		// Set up warning handler
		archive.on('warning', (err: Error & { code?: string }) => {
			if (err.code === 'ENOENT') {
				console.warn('Archive warning:', err.message);
			} else {
				console.error('Archive warning:', err);
				throw err;
			}
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
					buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				}
				const fileBuffer = Buffer.concat(buffers);

				// Defensive check: verify buffer size matches expected size and is not empty
				if (fileBuffer.length === 0) {
					console.warn(`Skipping ${s3Key}: file buffer is empty`);
					return false;
				}

				// Add to ZIP
				archive.append(fileBuffer, { name: zipFilename });
				filesAdded++;
				totalBytesAdded += fileBuffer.length;
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

		// Process each original file
		// CRITICAL: Exclude previews and thumbnails - only include actual original images
		for (const key of keys) {
			// Validate key format
			if (!key || typeof key !== 'string') {
				console.warn('Skipping invalid key', { key, galleryId, orderId });
				continue;
			}
			
			// Skip previews/thumbs paths
			if (key.includes('/previews/') || key.includes('/thumbs/') || key.includes('/')) {
				console.warn('Skipping preview/thumb/path key', { key, galleryId, orderId });
				continue;
			}
			
			// Add file to ZIP
			const s3Key = `galleries/${galleryId}/originals/${key}`;
			await addFileToZip(s3Key, key);
		}

		// Ensure at least one file was added
		if (filesAdded === 0) {
			throw new Error(`No files were successfully added to ZIP. Attempted to add ${keys.length} files.`);
		}

		// Finalize the archive and wait for completion
		const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
			// Set up finalization handlers
			archive.once('end', () => {
				const buffer = Buffer.concat(chunks);
				console.log('Archive finalized', {
					filesAdded,
					totalBytesAdded,
					zipSize: buffer.length,
					compressionRatio: totalBytesAdded > 0 
						? `${((totalBytesAdded - buffer.length) / totalBytesAdded * 100).toFixed(2)}%` 
						: 'N/A'
				});
				resolve(buffer);
			});
			
			archive.once('error', (err: Error) => {
				console.error('Archive error during finalization:', err);
				reject(err);
			});
			
			// Finalize the archive
			archive.finalize();
		});

		// Validate ZIP buffer
		if (zipBuffer.length === 0) {
			throw new Error('ZIP archive is empty');
		}

		// Validate ZIP file signature (PK header)
		const zipSignature = zipBuffer.slice(0, 2).toString('ascii');
		if (zipSignature !== 'PK') {
			throw new Error(`Invalid ZIP signature: ${zipSignature}. ZIP creation failed.`);
		}

		console.log('ZIP created successfully', {
			galleryId,
			orderId,
			zipKey,
			zipSize: zipBuffer.length,
			keysCount: keys.length
		});

		// Upload ZIP to S3
		// Note: ZIP files should NOT be directly accessible via S3 URLs
		// They must be accessed through the Download ZIP Lambda function for security
		// The bucket has BLOCK_ALL public access, so files are private by default
		await s3.send(new PutObjectCommand({
			Bucket: bucket,
			Key: zipKey,
			Body: zipBuffer,
			ContentType: 'application/zip'
		}));

		// Clear zipGenerating flag if it exists (no longer storing zipKey)
		const ordersTable = envProc?.env?.ORDERS_TABLE as string;
		if (ordersTable) {
			try {
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'REMOVE zipGenerating'
				}));
			} catch (updateErr: any) {
				// Log but don't fail - ZIP is created successfully
				console.error('Failed to clear zipGenerating flag:', {
					error: updateErr.message,
					galleryId,
					orderId
				});
			}
		}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				zipKey,
				galleryId,
				orderId,
				message: 'ZIP created successfully. Use download endpoint to access.'
			})
		};
	} catch (error: any) {
		console.error('ZIP generation failed:', error);
		
		// Clear zipGenerating flag on failure so user can retry
		const ordersTable = envProc?.env?.ORDERS_TABLE as string;
		if (ordersTable && galleryId && orderId) {
			try {
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'REMOVE zipGenerating, zipGeneratingSince'
				}));
				console.log('Cleared zipGenerating flag after failure', { galleryId, orderId });
			} catch (clearErr: any) {
				// Log but don't fail - we're already in error state
				console.error('Failed to clear zipGenerating flag after error:', {
					error: clearErr.message,
					galleryId,
					orderId
				});
			}
		}
		
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'ZIP generation failed', message: error.message })
		};
	}
});
