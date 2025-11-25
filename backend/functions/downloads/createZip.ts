import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import archiver from 'archiver';
import { Readable } from 'stream';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
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

		// Stream each original file from S3 into the ZIP
		for (const key of keys) {
			const originalKey = `galleries/${galleryId}/originals/${key}`;
			try {
				console.log('Fetching file from S3', { originalKey, key });
				const getObjectResponse = await s3.send(new GetObjectCommand({
					Bucket: bucket,
					Key: originalKey
				}));

				if (!getObjectResponse.Body) {
					console.error(`No body in S3 response for ${originalKey}`);
					continue;
				}

				const contentLength = getObjectResponse.ContentLength || 0;
				console.log('Reading file stream', { originalKey, contentLength, contentType: getObjectResponse.ContentType });

				const stream = getObjectResponse.Body as Readable;
				// Read stream into buffer and append to archive
				const buffers: Buffer[] = [];
				for await (const chunk of stream) {
					buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				}
				const fileBuffer = Buffer.concat(buffers);
				
				console.log('File read from S3', {
					originalKey,
					expectedSize: contentLength,
					actualSize: fileBuffer.length,
					match: contentLength === fileBuffer.length
				});

				if (fileBuffer.length === 0) {
					console.error(`File ${originalKey} is empty`);
					continue;
				}

				// Append file to ZIP with original filename
				// Use store: false to enable compression (default)
				archive.append(fileBuffer, { name: key });
				filesAdded++;
				totalBytesAdded += fileBuffer.length;
				console.log(`Added ${key} to ZIP (${fileBuffer.length} bytes, total: ${totalBytesAdded} bytes)`);
			} catch (err: any) {
				// Log but continue - some files might not exist
				console.error(`Failed to add ${originalKey} to ZIP:`, {
					error: err.message,
					name: err.name,
					code: err.code,
					key,
					originalKey
				});
			}
		}

		// Ensure at least one file was added
		if (filesAdded === 0) {
			throw new Error(`No files were successfully added to ZIP. Attempted to add ${keys.length} files.`);
		}

		// Finalize the archive and wait for completion
		// Remove the error handler we set up earlier (we'll handle it in the promise)
		archive.removeAllListeners('error');
		
		await new Promise<void>((resolve, reject) => {
			// Set up handlers for finalization
			archive.once('end', () => {
				console.log('Archive finalization completed');
				resolve();
			});
			archive.once('error', (err: Error) => {
				console.error('Archive error during finalization:', err);
				reject(err);
			});
			
			// Finalize the archive - this triggers processing of all queued files
			console.log('Finalizing archive...');
			archive.finalize();
		});

		// Combine chunks into single buffer
		const zipBuffer = Buffer.concat(chunks);
		
		console.log('Archive finalized', {
			chunksCount: chunks.length,
			totalSize: zipBuffer.length,
			chunksSizes: chunks.map(c => c.length),
			filesAdded,
			totalBytesAdded,
			compressionRatio: totalBytesAdded > 0 ? ((totalBytesAdded - zipBuffer.length) / totalBytesAdded * 100).toFixed(2) + '%' : 'N/A'
		});

		// Validate ZIP buffer - check for ZIP magic bytes (PK header)
		if (zipBuffer.length === 0) {
			throw new Error('ZIP archive is empty - no files were added');
		}

		// Check for ZIP file signature (PK\x03\x04 or PK\x05\x06 for empty ZIP)
		const zipSignature = zipBuffer.slice(0, 2).toString('ascii');
		if (zipSignature !== 'PK') {
			console.error('Invalid ZIP file signature after creation', {
				signature: zipSignature,
				firstBytes: Array.from(zipBuffer.slice(0, 10)),
				bufferLength: zipBuffer.length,
				galleryId,
				orderId,
				keysCount: keys.length
			});
			throw new Error(`Invalid ZIP file signature: ${zipSignature}. ZIP creation may have failed.`);
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
