import { lambdaLogger } from '../../../packages/logger/src';
import { 
	S3Client, 
	GetObjectCommand, 
	HeadObjectCommand,
	DeleteObjectCommand,
	ListObjectsV2Command,
	CreateMultipartUploadCommand,
	UploadPartCommand,
	CompleteMultipartUploadCommand,
	AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import archiver from 'archiver';
import { Readable } from 'stream';
import pLimit from 'p-limit';
import { createHash } from 'crypto';

// S3Client configured for production reliability
// Note: AWS_NODEJS_CONNECTION_REUSE_ENABLED=1 is set in Lambda environment for connection reuse
// Configured with retries and timeouts for production-scale reliability
const s3 = new S3Client({
	maxAttempts: 5, // Retry up to 5 times for transient errors
	requestHandler: {
		requestTimeout: 60000, // 60s timeout per request
		httpsAgent: {
			keepAlive: true,
			maxSockets: 50, // Connection pool size
			keepAliveMsecs: 30000
		}
	}
});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
	maxAttempts: 5 // Retry DynamoDB operations
}));

// Multipart upload constants
// Set to 15MB - optimized for best performance with 1024MB Lambda memory
// Fewer parts = faster CompleteMultipartUpload (tested: 9 parts @ 10MB → ~4-5 parts @ 20MB)
// 15MB parts provide optimal balance for 1024MB memory allocation
const PART_SIZE = 15 * 1024 * 1024; // 15MB per part (well above 5MB minimum, below 5GB max)
const MAX_PARTS = 10000; // S3 maximum

// Parallel download concurrency
// Set to 12 - balanced for reliability with 1024MB Lambda memory
// Connection reuse enabled (AWS_NODEJS_CONNECTION_REUSE_ENABLED=1) allows efficient connection handling
// Slightly reduced from 15 to 12 to reduce connection pressure and ECONNRESET errors
const CONCURRENT_DOWNLOADS = 12;

interface MultipartPart {
	partNumber: number;
	etag: string;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const startTime = Date.now();
	const requestId = context?.requestId || context?.awsRequestId || 'unknown';
	
	console.log('ZIP generation Lambda invoked', {
		requestId,
		eventType: typeof event,
		hasBody: !!event.body,
		eventKeys: Object.keys(event),
		eventPreview: JSON.stringify(event).substring(0, 200),
		remainingTimeMs: context?.getRemainingTimeInMillis?.() || 'unknown'
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
	// Both hash types are computed in the calling functions (downloadZip.ts / downloadFinalZip.ts) for consistency
	let payload: { 
		galleryId: string; 
		keys?: string[]; 
		orderId: string; 
		type?: string; 
		finalFilesHash?: string; 
		selectedKeysHash?: string; // Hash for original ZIPs (computed in downloadZip.ts)
	};
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

	const { galleryId, keys, orderId, type, finalFilesHash, selectedKeysHash } = payload;
	const isFinal = type === 'final';
	
		console.log('ZIP generation started', {
			requestId,
			galleryId,
			orderId,
			type,
			isFinal,
			keysCount: keys?.length || 0,
			hasKeys: !!keys,
			isArray: Array.isArray(keys),
			hasFinalFilesHash: !!finalFilesHash,
			remainingTimeMs: context?.getRemainingTimeInMillis?.() || 'unknown'
		});
	
	// Validate required fields based on type
	if (!galleryId || !orderId) {
		console.error('Missing required fields', {
			hasGalleryId: !!galleryId,
			hasOrderId: !!orderId,
			payload
		});
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or orderId' })
		};
	}

	// For original ZIPs, keys must be provided
	// For final ZIPs, we'll fetch keys from S3
	if (!isFinal && (!keys || !Array.isArray(keys))) {
		console.error('Missing keys for original ZIP', {
			hasKeys: !!keys,
			keysIsArray: Array.isArray(keys),
			payload
		});
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing keys array for original ZIP' })
		};
	}

		// Determine ZIP key based on type
		const zipKey = isFinal 
			? `galleries/${galleryId}/orders/${orderId}/final-zip/gallery-${galleryId}-order-${orderId}-final.zip`
			: `galleries/${galleryId}/zips/${orderId}.zip`;
		
		// Compute current hash for content validation
		// Both hashes are computed in the calling functions for consistency:
		// - Final ZIPs: finalFilesHash computed in downloadFinalZip.ts (from S3 file list with metadata)
		// - Original ZIPs: selectedKeysHash computed in downloadZip.ts (from order.selectedKeys with metadata)
		// Fallback: compute hash here if not provided (for background processes or backward compatibility)
		// Hash includes file metadata (ETag, size, lastModified) to detect content changes
		let currentHash: string | undefined;
		
		if (isFinal) {
			// Use provided hash, or compute from S3 file list if not provided
			if (finalFilesHash) {
				currentHash = finalFilesHash;
			} else {
				// Fallback: fetch file list and compute hash with metadata
				const prefix = `galleries/${galleryId}/final/${orderId}/`;
				const listResponse = await s3.send(new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: prefix
				}));
				
				if (listResponse.Contents && listResponse.Contents.length > 0) {
					const finalFilesWithMetadata = listResponse.Contents
						.map(obj => {
							const filename = (obj.Key || '').replace(prefix, '');
							return {
								filename,
								etag: obj.ETag || '',
								size: obj.Size || 0,
								lastModified: obj.LastModified?.getTime() || 0
							};
						})
						.filter(item => {
							return item.filename && 
								!item.filename.includes('/previews/') && 
								!item.filename.includes('/thumbs/') && 
								!item.filename.includes('/bigthumbs/') &&
								!item.filename.includes('/');
						})
						.sort((a, b) => a.filename.localeCompare(b.filename));
					
					currentHash = createHash('sha256')
						.update(JSON.stringify(finalFilesWithMetadata))
						.digest('hex')
						.substring(0, 16);
					
					console.log('Computed finalFilesHash from metadata (not provided)', {
						requestId,
						galleryId,
						orderId,
						hash: currentHash,
						filesCount: finalFilesWithMetadata.length
					});
				}
			}
		} else {
			// Use provided hash, or compute from keys with metadata if not provided
			if (selectedKeysHash) {
				currentHash = selectedKeysHash;
			} else if (keys && Array.isArray(keys)) {
				// Fallback: fetch metadata for each key and compute hash
				const limit = pLimit(10); // Limit concurrent HeadObject calls
				
				const filesWithMetadata = await Promise.all(
					keys.map(key => 
						limit(async () => {
							const s3Key = `galleries/${galleryId}/originals/${key}`;
							try {
								const headResponse = await s3.send(new HeadObjectCommand({
									Bucket: bucket,
									Key: s3Key
								}));
								return {
									filename: key,
									etag: headResponse.ETag || '',
									size: headResponse.ContentLength || 0,
									lastModified: headResponse.LastModified?.getTime() || 0
								};
							} catch (headErr: any) {
								if (headErr.name === 'NotFound' || headErr.name === 'NoSuchKey') {
									return {
										filename: key,
										etag: '',
										size: 0,
										lastModified: 0,
										missing: true
									};
								}
								throw headErr;
							}
						})
					)
				);
				
				filesWithMetadata.sort((a, b) => a.filename.localeCompare(b.filename));
				
				currentHash = createHash('sha256')
					.update(JSON.stringify(filesWithMetadata))
					.digest('hex')
					.substring(0, 16);
				
				console.warn('Computed hash in ZIP generation with metadata (should be provided by caller)', {
					requestId,
					galleryId,
					orderId,
					reason: 'selectedKeysHash not provided in payload',
					filesCount: filesWithMetadata.length
				});
			}
		}
		
		// Idempotency check: Verify ZIP exists AND hash matches (for retry safety)
		// If hash doesn't match, we must regenerate to replace old ZIP
		try {
			const headResponse = await s3.send(new HeadObjectCommand({
				Bucket: bucket,
				Key: zipKey
			}));
			
			// ZIP exists - check if hash matches
			const storedHashFromMetadata = isFinal 
				? headResponse.Metadata?.['finalfiles-hash']
				: headResponse.Metadata?.['selectedkeys-hash'];
			
			if (currentHash && storedHashFromMetadata === currentHash) {
				// ZIP exists with matching hash - this is an idempotent retry, return success
				console.log('ZIP already exists with matching hash (idempotency check)', {
					requestId,
					galleryId,
					orderId,
					zipKey,
					size: headResponse.ContentLength,
					etag: headResponse.ETag,
					hash: currentHash,
					isFinal
				});
				
				// Clear generating flag if still set
				const ordersTable = envProc?.env?.ORDERS_TABLE as string;
				if (ordersTable) {
					try {
						if (isFinal) {
							const updateExpr = finalFilesHash
								? 'REMOVE finalZipGenerating, finalZipGeneratingSince SET finalZipFilesHash = :h'
								: 'REMOVE finalZipGenerating, finalZipGeneratingSince';
							const updateValues = finalFilesHash ? { ':h': finalFilesHash } : undefined;
							await ddb.send(new UpdateCommand({
								TableName: ordersTable,
								Key: { galleryId, orderId },
								UpdateExpression: updateExpr,
								ExpressionAttributeValues: updateValues
							}));
						} else {
							// Clear original ZIP flag and store hash
							const updateExpr = currentHash
								? 'REMOVE zipGenerating, zipGeneratingSince SET zipSelectedKeysHash = :h'
								: 'REMOVE zipGenerating, zipGeneratingSince';
							const updateValues = currentHash ? { ':h': currentHash } : undefined;
							
							await ddb.send(new UpdateCommand({
								TableName: ordersTable,
								Key: { galleryId, orderId },
								UpdateExpression: updateExpr,
								ExpressionAttributeValues: updateValues
							}));
						}
					} catch (clearErr: any) {
						console.warn('Failed to clear generating flag for existing ZIP', {
							error: clearErr.message,
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
						message: 'ZIP already exists with matching hash (idempotent retry)',
						alreadyExists: true
					})
				};
			} else {
				// ZIP exists but hash mismatch - content changed, must regenerate
				console.log('ZIP exists but hash mismatch - will regenerate', {
					requestId,
					galleryId,
					orderId,
					zipKey,
					storedHash: storedHashFromMetadata,
					currentHash: currentHash,
					reason: storedHashFromMetadata ? 'content changed' : 'no hash stored',
					isFinal
				});
				
				// Delete old ZIP to replace with new one
				try {
					await s3.send(new DeleteObjectCommand({
						Bucket: bucket,
						Key: zipKey
					}));
					console.log('Deleted old ZIP with mismatched hash', {
						requestId,
						galleryId,
						orderId,
						zipKey
					});
				} catch (deleteErr: any) {
					console.warn('Failed to delete old ZIP (will overwrite)', {
						error: deleteErr.message,
						galleryId,
						orderId,
						zipKey
					});
					// Continue anyway - multipart upload will overwrite
				}
			}
		} catch (headErr: any) {
			// ZIP doesn't exist - proceed with generation
			if (headErr.name !== 'NotFound' && headErr.name !== 'NoSuchKey') {
				// Unexpected error checking for existing ZIP
				console.warn('Error checking for existing ZIP (proceeding anyway)', {
					error: headErr.message,
					name: headErr.name,
					galleryId,
					orderId
				});
			}
		}
		
		let multipartUploadId: string | undefined;
		let firstPartBuffer: Buffer | undefined;
		let parts: MultipartPart[] = []; // Declared outside try block for error handling
		
		// Sequential part upload queue to ensure order and proper error handling
		// Declared outside try block so it's accessible in catch block for cleanup
		let lastUploadPromise = Promise.resolve<void>(undefined);

		try {
		// For final ZIPs, fetch file list from S3
		let finalKeys: string[] = [];
		if (isFinal) {
			const prefix = `galleries/${galleryId}/final/${orderId}/`;
			const listResponse = await s3.send(new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix
			}));

			if (!listResponse.Contents || listResponse.Contents.length === 0) {
				throw new Error(`No final images found for order ${orderId}`);
			}

			// Extract filenames, filtering out previews/thumbs subdirectories
			finalKeys = listResponse.Contents
				.map(obj => obj.Key || '')
				.map(key => key.replace(prefix, '')) // Extract filename
				.filter(filename => {
					// Only include files directly in final/{orderId}/, not in subdirectories
					return filename && 
						!filename.includes('/previews/') && 
						!filename.includes('/thumbs/') && 
						!filename.includes('/bigthumbs/') &&
						!filename.includes('/'); // No subdirectories
				})
				.sort();

			console.log('Fetched final files from S3', {
				galleryId,
				orderId,
				finalKeysCount: finalKeys.length,
				finalFilesHash
			});

			if (finalKeys.length === 0) {
				throw new Error(`No valid final images found (all filtered out)`);
			}
		}

		// Use finalKeys for final ZIPs, keys for original ZIPs
		const filesToZip = isFinal ? finalKeys : (keys || []);

		// Prepare metadata for multipart upload (store hash for validation)
		const metadata: Record<string, string> = {};
		if (isFinal && finalFilesHash) {
			metadata['finalfiles-hash'] = finalFilesHash;
		} else if (!isFinal && currentHash) {
			// Store hash for original ZIPs to detect content changes
			metadata['selectedkeys-hash'] = currentHash;
		}

		// Create multipart upload at start
		const createMultipartResponse = await s3.send(new CreateMultipartUploadCommand({
			Bucket: bucket,
			Key: zipKey,
			ContentType: 'application/zip',
			Metadata: Object.keys(metadata).length > 0 ? metadata : undefined
		}));

		if (!createMultipartResponse.UploadId) {
			throw new Error('Failed to create multipart upload');
		}

		multipartUploadId = createMultipartResponse.UploadId;
		console.log('Multipart upload created', {
			requestId,
			galleryId,
			orderId,
			zipKey,
			uploadId: multipartUploadId,
			remainingTimeMs: context?.getRemainingTimeInMillis?.() || 'unknown'
		});

		// Create ZIP archive in store mode (no compression - images already compressed)
		const archive = archiver('zip', { 
			store: true // No compression - JPEG/PNG already compressed
		});

		let filesAdded = 0;
		let totalBytesAdded = 0;
		// parts already declared outside try block
		let currentPartNumber = 1;
		let currentPartBuffer = Buffer.alloc(0);
		let zipTotalSize = 0;
		let archiveError: Error | null = null;

		// Set up error handler
		archive.on('error', (err: Error) => {
			console.error('Archive error:', err);
			archiveError = err;
		});

		// Set up warning handler
		archive.on('warning', (err: Error & { code?: string }) => {
			if (err.code === 'ENOENT') {
				console.warn('Archive warning:', err.message);
			} else {
				console.error('Archive warning:', err);
				archiveError = err;
			}
		});

		// Stream archiver output to multipart upload parts
		// Use sequential queue to ensure parts upload in order
		archive.on('data', (chunk: Buffer) => {
			if (archiveError) {
				return; // Stop processing if archive errored
			}

			zipTotalSize += chunk.length;
			currentPartBuffer = Buffer.concat([currentPartBuffer, chunk]);

			// When part buffer reaches PART_SIZE, queue sequential upload
			while (currentPartBuffer.length >= PART_SIZE) {
				const partData = currentPartBuffer.slice(0, PART_SIZE);
				currentPartBuffer = currentPartBuffer.slice(PART_SIZE);
				const partNum = currentPartNumber;

				// Store first part for ZIP signature validation
				if (partNum === 1 && !firstPartBuffer) {
					firstPartBuffer = Buffer.from(partData);
				}

				// Chain uploads sequentially to ensure order
				lastUploadPromise = lastUploadPromise.then(async () => {
					if (archiveError) {
						throw archiveError;
					}

					try {
						const uploadPartResponse = await s3.send(new UploadPartCommand({
							Bucket: bucket,
							Key: zipKey,
							UploadId: multipartUploadId,
							PartNumber: partNum,
							Body: partData
						}));

						if (!uploadPartResponse.ETag) {
							throw new Error(`Failed to upload part ${partNum}: no ETag returned`);
						}

						parts.push({
							partNumber: partNum,
							etag: uploadPartResponse.ETag
						});

						console.log('Uploaded multipart part', {
							partNumber: partNum,
							partSize: partData.length,
							totalParts: parts.length,
							zipSizeSoFar: zipTotalSize
						});

						// Check part limit
						if (partNum >= MAX_PARTS) {
							throw new Error(`ZIP too large: exceeds S3 maximum of ${MAX_PARTS} parts`);
						}
					} catch (partErr: any) {
						console.error(`Failed to upload part ${partNum}:`, {
							error: partErr.message,
							name: partErr.name
						});
						archiveError = partErr;
						throw partErr;
					}
				});

				currentPartNumber++;
			}
		});

		// Helper function to validate and add a file to the ZIP (streaming version)
		// Includes retry logic for transient connection errors with exponential backoff
		const addFileToZip = async (s3Key: string, zipFilename: string, retryCount = 0): Promise<boolean> => {
			const MAX_RETRIES = 3; // Increased to 3 retries for better resilience
			// Exponential backoff: 1s, 2s, 4s - gives connections more time to recover
			const getRetryDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 4000);
			
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

				// Stream directly to archiver (no buffering)
				const s3Stream = getObjectResponse.Body as Readable;
				
				// Critical: Attach error handlers early and permanently
				s3Stream.on('error', (err) => {
					console.error(`S3 stream error for ${s3Key}:`, err);
					s3Stream.resume(); // Prevent hanging in paused state
				});
				
				// Destroy stream on error to force cleanup
				s3Stream.once('error', () => s3Stream.destroy());
				
				archive.append(s3Stream, { name: zipFilename });
				
				filesAdded++;
				totalBytesAdded += contentLength;
				console.log(`Added ${zipFilename} to ZIP (${contentLength} bytes)`);
				return true;
			} catch (err: any) {
				// Handle file not found - don't retry
				if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
					console.warn(`Skipping ${s3Key}: file not found`);
					return false;
				}
				
				// Check if error is retryable (transient connection errors)
				const isRetryable = 
					err.code === 'ECONNRESET' ||
					err.code === 'EPIPE' ||
					err.code === 'ETIMEDOUT' ||
					err.name === 'TimeoutError' ||
					err.message?.includes('socket hang up') ||
					err.message?.includes('ECONNRESET') ||
					err.message?.includes('EPIPE');
				
				// Retry transient errors with exponential backoff
				if (isRetryable && retryCount < MAX_RETRIES) {
					const delay = getRetryDelay(retryCount);
					console.warn(`Retrying ${s3Key} (attempt ${retryCount + 1}/${MAX_RETRIES + 1}) after ${delay}ms:`, {
						error: err.message,
						code: err.code
					});
					
					await new Promise(resolve => setTimeout(resolve, delay));
					return addFileToZip(s3Key, zipFilename, retryCount + 1);
				}
				
				// Non-retryable error or max retries exceeded
				console.error(`Failed to add ${s3Key} to ZIP:`, {
					error: err.message,
					name: err.name,
					code: err.code,
					retryCount
				});
				return false;
			}
		};

		// Process files in parallel with controlled concurrency
		const limit = pLimit(CONCURRENT_DOWNLOADS);
		const validKeys = filesToZip.filter(key => {
			// Validate key format
			if (!key || typeof key !== 'string') {
				console.warn('Skipping invalid key', { key, galleryId, orderId, isFinal });
				return false;
			}
			
			// Skip previews/thumbs paths (shouldn't happen for final files, but be safe)
			if (key.includes('/previews/') || key.includes('/thumbs/') || key.includes('/bigthumbs/') || (key.includes('/') && !isFinal)) {
				console.warn('Skipping preview/thumb/path key', { key, galleryId, orderId, isFinal });
				return false;
			}
			
			return true;
		});
		
		let processed = 0;
		let lastProgressLog = Date.now();
		const PROGRESS_LOG_INTERVAL = 5000; // Log every 5 seconds for production (reduced verbosity)
		const TIMEOUT_WARNING_MS = 2 * 60 * 1000; // Warn if less than 2 minutes remaining
		
		const fileTasks = validKeys.map(key => {
			// Construct S3 key based on type
			const s3Key = isFinal 
				? `galleries/${galleryId}/final/${orderId}/${key}`
				: `galleries/${galleryId}/originals/${key}`;
			return limit(async () => {
				const result = await addFileToZip(s3Key, key);
				processed++;
				
				// Log progress periodically with timeout monitoring
				const now = Date.now();
				const remainingTime = context?.getRemainingTimeInMillis?.();
				if (now - lastProgressLog >= PROGRESS_LOG_INTERVAL) {
					const elapsedMs = now - startTime;
					const logData: any = {
						requestId,
						processed,
						total: validKeys.length,
						progressPercent: Math.round((processed / validKeys.length) * 100),
						elapsedSeconds: Math.round(elapsedMs / 1000),
						isFinal
					};
					
					if (remainingTime && remainingTime < TIMEOUT_WARNING_MS) {
						logData.warning = 'Low remaining time';
						logData.remainingTimeMs = remainingTime;
					}
					
					console.log(`Progress: ${processed}/${validKeys.length} files added`, logData);
					lastProgressLog = now;
				}
				return result;
			});
		});

		await Promise.all(fileTasks);

		// Ensure at least one file was added
		if (filesAdded === 0) {
			throw new Error(`No files were successfully added to ZIP. Attempted to add ${filesToZip.length} files.`);
		}

		// Finalize the archive and wait for completion
		try {
			await archive.finalize(); // Built-in Promise
			console.log('Archive finalized', {
				filesAdded,
				totalBytesAdded,
				zipSize: zipTotalSize,
				partsUploaded: parts.length,
				compressionRatio: '0% (store mode)'
			});
		} catch (err: any) {
			console.error('Archive finalize failed:', err);
			archiveError = err;
			throw err;
		}

		// Check for archive errors
		if (archiveError) {
			throw archiveError;
		}

		// Wait for all queued part uploads to complete
		await lastUploadPromise;

		// Upload remaining buffer as final part (if any)
		if (currentPartBuffer.length > 0) {
			// Last part can be smaller than MIN_PART_SIZE
			const uploadPartResponse = await s3.send(new UploadPartCommand({
				Bucket: bucket,
				Key: zipKey,
				UploadId: multipartUploadId,
				PartNumber: currentPartNumber,
				Body: currentPartBuffer
			}));

			if (!uploadPartResponse.ETag) {
				throw new Error(`Failed to upload final part ${currentPartNumber}: no ETag returned`);
			}

			parts.push({
				partNumber: currentPartNumber,
				etag: uploadPartResponse.ETag
			});

			console.log('Uploaded final multipart part', {
				partNumber: currentPartNumber,
				partSize: currentPartBuffer.length,
				totalParts: parts.length
			});
		}

		// Validate ZIP signature (PK header) from first part
		if (!firstPartBuffer || firstPartBuffer.length < 2) {
			throw new Error('ZIP archive is empty or too small');
		}

		const zipSignature = firstPartBuffer.slice(0, 2).toString('ascii');
		if (zipSignature !== 'PK') {
			throw new Error(`Invalid ZIP signature: ${zipSignature}. ZIP creation failed.`);
		}

		// Validate we have at least one part
		if (parts.length === 0) {
			throw new Error('No parts uploaded to multipart upload');
		}

		// Sort parts by part number (should already be sorted, but be safe)
		const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);

		// Complete multipart upload
		const completeResponse = await s3.send(new CompleteMultipartUploadCommand({
			Bucket: bucket,
			Key: zipKey,
			UploadId: multipartUploadId,
			MultipartUpload: {
				Parts: sortedParts.map(part => ({
					PartNumber: part.partNumber,
					ETag: part.etag
				}))
			}
		}));

		const durationMs = Date.now() - startTime;
		const remainingTime = context?.getRemainingTimeInMillis?.();
		
		console.log('ZIP created successfully', {
			requestId,
			galleryId,
			orderId,
			zipKey,
			zipSize: zipTotalSize,
			zipSizeMB: Math.round((zipTotalSize / (1024 * 1024)) * 100) / 100,
			keysCount: filesToZip.length,
			filesAdded,
			totalParts: parts.length,
			etag: completeResponse.ETag,
			isFinal,
			durationSeconds: Math.round(durationMs / 1000),
			throughputMBps: Math.round((zipTotalSize / (1024 * 1024)) / (durationMs / 1000) * 100) / 100,
			remainingTimeMs: remainingTime || 'unknown'
		});

		// Clear ZIP generating flag based on type
		const ordersTable = envProc?.env?.ORDERS_TABLE as string;
		if (ordersTable) {
			try {
				if (isFinal) {
					// Clear final ZIP flags and store hash
					const updateExpr = finalFilesHash
						? 'REMOVE finalZipGenerating, finalZipGeneratingSince SET finalZipFilesHash = :h'
						: 'REMOVE finalZipGenerating, finalZipGeneratingSince';
					const updateValues = finalFilesHash ? { ':h': finalFilesHash } : undefined;
					
					await ddb.send(new UpdateCommand({
						TableName: ordersTable,
						Key: { galleryId, orderId },
						UpdateExpression: updateExpr,
						ExpressionAttributeValues: updateValues
					}));
				} else {
					// Clear original ZIP flag and store hash
					const updateExpr = currentHash
						? 'REMOVE zipGenerating, zipGeneratingSince SET zipSelectedKeysHash = :h'
						: 'REMOVE zipGenerating, zipGeneratingSince';
					const updateValues = currentHash ? { ':h': currentHash } : undefined;
					
					await ddb.send(new UpdateCommand({
						TableName: ordersTable,
						Key: { galleryId, orderId },
						UpdateExpression: updateExpr,
						ExpressionAttributeValues: updateValues
					}));
				}
			} catch (updateErr: any) {
				// Log but don't fail - ZIP is created successfully
				console.error(`Failed to clear ${isFinal ? 'finalZipGenerating' : 'zipGenerating'} flag:`, {
					error: updateErr.message,
					galleryId,
					orderId,
					isFinal
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
		const durationMs = Date.now() - startTime;
		const remainingTime = context?.getRemainingTimeInMillis?.();
		
		console.error('ZIP generation failed', {
			requestId,
			galleryId: galleryId || 'unknown',
			orderId: orderId || 'unknown',
			error: error.message,
			errorName: error.name,
			errorStack: error.stack?.substring(0, 500),
			durationSeconds: Math.round(durationMs / 1000),
			remainingTimeMs: remainingTime || 'unknown',
			multipartUploadId: multipartUploadId || 'none',
			partsUploaded: parts.length
		});
		
		// Wait for any pending upload operations to complete or timeout
		if (lastUploadPromise) {
			try {
				await Promise.race([
					lastUploadPromise,
					new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timeout')), 30000))
				]);
			} catch (cleanupErr: any) {
				console.warn('Error waiting for upload queue:', {
					error: cleanupErr.message,
					galleryId,
					orderId
				});
			}
		}
		
		// Abort multipart upload on failure
		if (multipartUploadId && zipKey) {
			try {
				await s3.send(new AbortMultipartUploadCommand({
					Bucket: bucket,
					Key: zipKey,
					UploadId: multipartUploadId
				}));
				console.log('Aborted multipart upload after failure', {
					galleryId,
					orderId,
					uploadId: multipartUploadId
				});
			} catch (abortErr: any) {
				// Log but don't fail - we're already in error state
				console.error('Failed to abort multipart upload:', {
					error: abortErr.message,
					galleryId,
					orderId,
					uploadId: multipartUploadId
				});
			}
		}
		
		// Clear ZIP generating flag on failure so user can retry
		const ordersTable = envProc?.env?.ORDERS_TABLE as string;
		if (ordersTable && galleryId && orderId) {
			try {
				const updateExpr = isFinal
					? 'REMOVE finalZipGenerating, finalZipGeneratingSince'
					: 'REMOVE zipGenerating, zipGeneratingSince';
				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: updateExpr
				}));
				console.log(`Cleared ${isFinal ? 'finalZipGenerating' : 'zipGenerating'} flag after failure`, { 
					galleryId, 
					orderId,
					isFinal 
				});
			} catch (clearErr: any) {
				// Log but don't fail - we're already in error state
				console.error(`Failed to clear ${isFinal ? 'finalZipGenerating' : 'zipGenerating'} flag after error:`, {
					error: clearErr.message,
					galleryId,
					orderId,
					isFinal
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
