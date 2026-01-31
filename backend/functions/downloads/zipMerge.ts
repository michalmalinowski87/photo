/**
 * ZIP Merge - streams raw files from temp prefix directly into final ZIP
 * Invoked by Step Functions after all chunk workers complete
 * Workers copy raw files to temp prefix; merge streams them directly into final ZIP
 */
import { lambdaLogger } from '../../../packages/logger/src';
import {
	S3Client,
	GetObjectCommand,
	DeleteObjectsCommand,
	ListObjectsV2Command,
	CreateMultipartUploadCommand,
	UploadPartCommand,
	CompleteMultipartUploadCommand,
	AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import yazl from 'yazl';
import pLimit from 'p-limit';
import { Readable, PassThrough } from 'stream';
import { MERGE_PART_SIZE, MAX_PARTS, MERGE_CONCURRENT_GETS } from '../../lib/src/zip-constants';

// Increased timeout to 10 minutes to handle large files and slow streams
// Lambda max is 15 minutes, so 10 minutes gives buffer for processing
const S3_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const s3 = new S3Client({
	maxAttempts: 5,
	requestHandler: {
		requestTimeout: S3_REQUEST_TIMEOUT_MS,
		httpsAgent: { 
			keepAlive: true, 
			maxSockets: 100, 
			keepAliveMsecs: 30000,
			timeout: S3_REQUEST_TIMEOUT_MS // Socket timeout matches request timeout
		}
	}
});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 5 }));

interface MultipartPart {
	partNumber: number;
	etag: string;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const startTime = Date.now();
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;

	const state = event;
	const { galleryId, orderId, type, runId, workerCount, finalFilesHash, selectedKeysHash } = state;
	const chunkResults = state.chunkResults ?? [];
	const isFinal = type === 'final';

	// Input validation
	if (!bucket || !galleryId || !orderId || !runId) {
		throw new Error('Missing required fields: bucket, galleryId, orderId, or runId');
	}
	
	// Validate runId format (should be nanoid, alphanumeric)
	if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
		throw new Error(`Invalid runId format: ${runId}`);
	}
	
	// Validate galleryId and orderId are non-empty strings
	if (typeof galleryId !== 'string' || galleryId.trim().length === 0) {
		throw new Error(`Invalid galleryId: ${galleryId}`);
	}
	if (typeof orderId !== 'string' || orderId.trim().length === 0) {
		throw new Error(`Invalid orderId: ${orderId}`);
	}

	const tempPrefix = `galleries/${galleryId}/tmp/${orderId}/${runId}/`;
	const zipKey = isFinal
		? `galleries/${galleryId}/orders/${orderId}/final-zip/gallery-${galleryId}-order-${orderId}-final.zip`
		: `galleries/${galleryId}/zips/${orderId}.zip`;

	const filesCount = chunkResults.reduce((s: number, c: any) => s + (c.filesAdded ?? 0), 0);
	logger?.info('Merge started', { 
		galleryId, 
		orderId, 
		tempPrefix, 
		filesCount, 
		zipKey,
		workerCount: workerCount || 'unknown',
		runId
	});

	let uploadId: string | undefined;
	const tempKeysToDelete: string[] = [];

	try {
		let zipExpiresAt: Date | undefined;
		if (galleriesTable) {
			try {
				const g = await ddb.send(new GetCommand({
					TableName: galleriesTable,
					Key: { galleryId }
				}));
				if (g.Item?.expiresAt) zipExpiresAt = new Date(g.Item.expiresAt);
			} catch {}
		}

		const metadata: Record<string, string> = {};
		if (isFinal && finalFilesHash) metadata['finalfiles-hash'] = finalFilesHash;
		if (!isFinal && selectedKeysHash) metadata['selectedkeys-hash'] = selectedKeysHash;

		const createResp = await s3.send(new CreateMultipartUploadCommand({
			Bucket: bucket,
			Key: zipKey,
			ContentType: 'application/zip',
			StorageClass: 'INTELLIGENT_TIERING',
			Metadata: Object.keys(metadata).length ? metadata : undefined,
			...(zipExpiresAt && { Expires: zipExpiresAt })
		}));
		uploadId = createResp.UploadId;
		if (!uploadId) {
			throw new Error(`Failed to create multipart upload - no UploadId returned for ${zipKey}`);
		}
		
		logger?.info('Multipart upload created', { uploadId, zipKey });

		const zipfile = new yazl.ZipFile();
		let parts: MultipartPart[] = [];
		let currentPartNumber = 1;
		// Pre-allocate buffer chunks to avoid repeated Buffer.concat (GC pressure)
		const bufferChunks: Buffer[] = [];
		let bufferTotalSize = 0;
		let zipTotalSize = 0;
		let lastUploadPromise = Promise.resolve<void>(undefined);
		let zipError: Error | null = null;
		let uploadQueueSize = 0;
		const MAX_UPLOAD_QUEUE = 5; // Limit concurrent uploads to avoid memory pressure

		zipfile.outputStream.on('error', (err: Error) => {
			logger?.error('yazl output stream error', {}, err);
			zipError = err;
		});
		
		// Optimized buffer management: collect chunks, upload when threshold reached
		zipfile.outputStream.on('data', (chunk: Buffer) => {
			if (zipError) return;
			zipTotalSize += chunk.length;
			bufferChunks.push(chunk);
			bufferTotalSize += chunk.length;
			
			// Safety check: prevent excessive buffer growth (shouldn't happen, but safeguard)
			if (bufferChunks.length > 1000) {
				logger?.warn('Excessive buffer chunks', { count: bufferChunks.length, bufferTotalSize });
			}
			
			// Upload parts when we have enough data, but limit concurrent uploads
			while (bufferTotalSize >= MERGE_PART_SIZE && uploadQueueSize < MAX_UPLOAD_QUEUE && !zipError) {
				// Collect exactly MERGE_PART_SIZE bytes
				const partBuffers: Buffer[] = [];
				let partSize = 0;
				while (partSize < MERGE_PART_SIZE && bufferChunks.length > 0) {
					const nextChunk = bufferChunks[0];
					const remaining = MERGE_PART_SIZE - partSize;
					if (nextChunk.length <= remaining) {
						partBuffers.push(bufferChunks.shift()!);
						partSize += nextChunk.length;
						bufferTotalSize -= nextChunk.length;
					} else {
						// Split chunk
						partBuffers.push(nextChunk.slice(0, remaining));
						bufferChunks[0] = nextChunk.slice(remaining);
						partSize += remaining;
						bufferTotalSize -= remaining;
					}
				}
				
				// Combine into single buffer for upload (only when needed)
				const partData = partBuffers.length === 1 ? partBuffers[0] : Buffer.concat(partBuffers);
				const partNum = currentPartNumber;
				uploadQueueSize++;
				
				lastUploadPromise = lastUploadPromise.then(async () => {
					if (zipError) throw zipError;
					if (!uploadId) throw new Error('Upload ID not available');
					
					try {
						const resp = await s3.send(new UploadPartCommand({
							Bucket: bucket,
							Key: zipKey,
							UploadId: uploadId,
							PartNumber: partNum,
							Body: partData
						}));
						if (!resp.ETag) throw new Error(`No ETag returned for part ${partNum}`);
						parts.push({ partNumber: partNum, etag: resp.ETag });
						if (partNum >= MAX_PARTS) {
							throw new Error(`Exceeds S3 maximum of ${MAX_PARTS} parts`);
						}
					} catch (uploadErr: any) {
						logger?.error('Failed to upload part', { 
							partNumber: partNum, 
							error: uploadErr.message,
							name: uploadErr.name
						});
						throw uploadErr;
					} finally {
						uploadQueueSize--;
					}
				}).catch((err) => {
					// Mark zipError so other uploads stop
					zipError = err instanceof Error ? err : new Error(String(err));
					throw err;
				});
				currentPartNumber++;
			}
		});

		// List all raw files under temp prefix
		let continuationToken: string | undefined;
		do {
			const listResp = await s3.send(new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: tempPrefix,
				ContinuationToken: continuationToken,
				MaxKeys: 1000
			}));
			const contents = listResp.Contents ?? [];
			for (const obj of contents) {
				if (obj.Key && !obj.Key.endsWith('/')) tempKeysToDelete.push(obj.Key);
			}
			continuationToken = listResp.NextContinuationToken;
		} while (continuationToken);

		if (tempKeysToDelete.length === 0) {
			throw new Error(`No temp files found to merge at prefix: ${tempPrefix}`);
		}
		
		// Validate expected file count matches actual
		if (filesCount > 0 && tempKeysToDelete.length !== filesCount) {
			logger?.warn('File count mismatch', { 
				expected: filesCount, 
				actual: tempKeysToDelete.length,
				note: 'Proceeding with actual file count'
			});
		}

		// Extract entry name: strip tempPrefix and chunk-N/ to get original key (filename)
		const getEntryName = (s3Key: string): string => {
			const relative = s3Key.replace(tempPrefix, '');
			const match = relative.match(/^chunk-\d+\/(.+)$/);
			return match ? match[1] : relative;
		};

		// Stream raw files directly into yazl with high concurrency
		// PassThrough streams handle backpressure - yazl pulls data when ready
		tempKeysToDelete.sort();
		const limit = pLimit(MERGE_CONCURRENT_GETS);
		const filePromises = tempKeysToDelete.map((s3Key, i) =>
			limit(async () => {
				const t0 = Date.now();
				let body: Readable | undefined;
				let passThrough: PassThrough | undefined;
				
				try {
					const getResp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
					body = getResp.Body as Readable;
					if (!body) {
						logger?.warn('No body for file', { index: i, s3Key });
						return;
					}
					
					const entryName = getEntryName(s3Key);
					
					// Use PassThrough to handle backpressure - yazl will pull when ready
					passThrough = new PassThrough({ highWaterMark: 64 * 1024 }); // 64KB buffer
					
					// Set up error handlers BEFORE piping to catch all errors
					const errorHandler = (err: Error) => {
						logger?.error('Stream error', { index: i, entryName, error: err.message, name: err.name });
						if (passThrough && !passThrough.destroyed) {
							passThrough.destroy(err);
						}
						if (body && !body.destroyed) {
							body.destroy();
						}
					};
					
					body.on('error', errorHandler);
					passThrough.on('error', errorHandler);
					
					// Pipe with backpressure handling
					// PassThrough will buffer data if yazl isn't ready, preventing timeout
					body.pipe(passThrough);
					
					// Add to zip - yazl will handle the stream
					zipfile.addReadStream(passThrough, entryName, { compress: false });
					
					// Wait for stream to complete with timeout protection
					await new Promise<void>((resolve, reject) => {
						if (!passThrough) {
							reject(new Error('PassThrough stream not created'));
							return;
						}
						
						const timeout = setTimeout(() => {
							const err = new Error(`Stream timeout for ${entryName} after ${S3_REQUEST_TIMEOUT_MS}ms`);
							logger?.error('Stream timeout', { index: i, entryName });
							if (passThrough && !passThrough.destroyed) {
								passThrough.destroy(err);
							}
							if (body && !body.destroyed) {
								body.destroy();
							}
							reject(err);
						}, S3_REQUEST_TIMEOUT_MS);
						
						passThrough.once('end', () => {
							clearTimeout(timeout);
							resolve();
						});
						passThrough.once('error', (err) => {
							clearTimeout(timeout);
							reject(err);
						});
					});
					
					const durationMs = Date.now() - t0;
					if (durationMs > 5000) { // Log slow files (>5s)
						logger?.info('File added (slow)', { index: i, entryName, durationMs });
					}
				} catch (err: any) {
					// Cleanup streams on error
					if (passThrough && !passThrough.destroyed) {
						passThrough.destroy();
					}
					if (body && !body.destroyed) {
						body.destroy();
					}
					
					// Check if it's a timeout error
					if (err.name === 'RequestTimeout' || err.message?.includes('timeout')) {
						logger?.error('Request timeout', { index: i, s3Key, error: err.message });
						throw new Error(`S3 request timeout for ${s3Key}: ${err.message}`);
					}
					
					logger?.error('Failed to add file', { index: i, s3Key, error: err.message, name: err.name });
					throw err;
				}
			})
		);
		
		// Use Promise.allSettled to handle individual failures without stopping the entire process
		// But we still want to fail if too many files fail
		const results = await Promise.allSettled(filePromises);
		const failures = results.filter(r => r.status === 'rejected');
		if (failures.length > 0) {
			const failureMessages = failures.map((f, idx) => {
				const reason = f.status === 'rejected' ? f.reason : 'Unknown';
				return `File ${idx}: ${reason?.message || reason}`;
			});
			logger?.error('Some files failed to process', { 
				failedCount: failures.length, 
				totalCount: tempKeysToDelete.length,
				failures: failureMessages.slice(0, 5) // Log first 5 failures
			});
			
			// Fail if more than 5% of files failed
			if (failures.length > tempKeysToDelete.length * 0.05) {
				throw new Error(`Too many files failed: ${failures.length}/${tempKeysToDelete.length}. First error: ${failures[0].status === 'rejected' ? failures[0].reason?.message : 'Unknown'}`);
			}
		}

		// Wait for ZIP stream to complete and all uploads to finish
		const streamEnded = new Promise<void>((res, rej) => {
			zipfile.outputStream.once('end', res).once('error', (err) => {
				zipError = err;
				rej(err);
			});
		});
		zipfile.end();
		
		// Wait for stream completion with timeout
		try {
			await Promise.race([
				streamEnded,
				new Promise<void>((_, reject) => 
					setTimeout(() => reject(new Error('ZIP stream timeout')), S3_REQUEST_TIMEOUT_MS)
				)
			]);
		} catch (streamErr: any) {
			if (zipError) throw zipError;
			throw streamErr;
		}
		
		// Check for zipError before proceeding
		if (zipError) {
			throw zipError;
		}
		
		// Wait for all pending uploads to complete with timeout
		try {
			await Promise.race([
				lastUploadPromise,
				new Promise<void>((_, reject) => 
					setTimeout(() => reject(new Error('Upload queue timeout')), S3_REQUEST_TIMEOUT_MS)
				)
			]);
		} catch (uploadErr: any) {
			if (zipError) throw zipError;
			throw uploadErr;
		}
		
		// Final check for zipError
		if (zipError) {
			throw zipError;
		}

		// Upload remaining buffer chunks as final part
		if (bufferChunks.length > 0) {
			const finalBuffer = bufferChunks.length === 1 
				? bufferChunks[0] 
				: Buffer.concat(bufferChunks);
			if (finalBuffer.length > 0) {
				const resp = await s3.send(new UploadPartCommand({
					Bucket: bucket,
					Key: zipKey,
					UploadId: uploadId!,
					PartNumber: currentPartNumber,
					Body: finalBuffer
				}));
				if (!resp.ETag) throw new Error('No ETag final part');
				parts.push({ partNumber: currentPartNumber, etag: resp.ETag });
			}
		}

		// Validate parts before completing multipart upload
		if (parts.length === 0) {
			throw new Error('No parts uploaded - cannot complete multipart upload');
		}
		
		parts.sort((a, b) => a.partNumber - b.partNumber);
		
		// Validate part numbers are sequential (1, 2, 3, ...)
		for (let i = 0; i < parts.length; i++) {
			if (parts[i].partNumber !== i + 1) {
				throw new Error(`Invalid part sequence: expected ${i + 1}, got ${parts[i].partNumber}`);
			}
		}
		
		// Complete multipart upload
		const completeResp = await s3.send(new CompleteMultipartUploadCommand({
			Bucket: bucket,
			Key: zipKey,
			UploadId: uploadId!,
			MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) }
		}));
		
		if (!completeResp.Location && !completeResp.Key) {
			throw new Error('Multipart upload completion failed - no location/key returned');
		}

		// Batch delete temp files (S3 allows 1000 per request)
		for (let i = 0; i < tempKeysToDelete.length; i += 1000) {
			const batch = tempKeysToDelete.slice(i, i + 1000);
			try {
				await s3.send(new DeleteObjectsCommand({
					Bucket: bucket,
					Delete: {
						Objects: batch.map(Key => ({ Key })),
						Quiet: true
					}
				}));
			} catch (e) {
				logger?.warn('Failed to delete temp batch', { count: batch.length });
			}
		}

		// Update DynamoDB to clear generating flags - critical for production
		if (ordersTable) {
			try {
				const hash = isFinal ? finalFilesHash : selectedKeysHash;
				if (hash) {
					await ddb.send(new UpdateCommand({
						TableName: ordersTable,
						Key: { galleryId, orderId },
						UpdateExpression: isFinal
							? 'REMOVE finalZipGenerating, finalZipGeneratingSince, finalZipRetryCount SET finalZipFilesHash = :h'
							: 'REMOVE zipGenerating, zipGeneratingSince, zipRetryCount SET zipSelectedKeysHash = :h',
						ExpressionAttributeValues: { ':h': hash }
					}));
				} else {
					await ddb.send(new UpdateCommand({
						TableName: ordersTable,
						Key: { galleryId, orderId },
						UpdateExpression: isFinal
							? 'REMOVE finalZipGenerating, finalZipGeneratingSince, finalZipRetryCount'
							: 'REMOVE zipGenerating, zipGeneratingSince, zipRetryCount'
					}));
				}
				logger?.info('Cleared generating flags', { galleryId, orderId, isFinal });
			} catch (ddbErr: any) {
				// Log but don't fail - ZIP is already created, this is just cleanup
				logger?.error('Failed to clear generating flags', { 
					galleryId, 
					orderId, 
					error: ddbErr.message,
					note: 'ZIP was created successfully but order may remain in generating state'
				});
			}
		}

		const durationMs = Date.now() - startTime;

		logger?.info('Merge completed', { 
			galleryId, 
			orderId, 
			zipSizeBytes: zipTotalSize, 
			filesCount: tempKeysToDelete.length,
			partsCount: parts.length,
			durationMs,
			throughputMBps: zipTotalSize > 0 && durationMs > 0 
				? ((zipTotalSize / (1024 * 1024)) / (durationMs / 1000)).toFixed(2)
				: '0'
		});
		return { zipKey, zipSizeBytes: zipTotalSize, durationMs };
	} catch (err: any) {
		// Cleanup: abort multipart upload on error
		if (uploadId && bucket && zipKey) {
			try {
				await s3.send(new AbortMultipartUploadCommand({
					Bucket: bucket,
					Key: zipKey,
					UploadId: uploadId
				}));
				logger?.info('Aborted multipart upload due to error', { uploadId, zipKey });
			} catch (abortErr: any) {
				logger?.warn('Failed to abort multipart upload', { 
					uploadId, 
					zipKey, 
					error: abortErr.message 
				});
			}
		}
		
		// Log error details for debugging
		logger?.error('Merge failed', {
			galleryId,
			orderId,
			error: err.message,
			name: err.name,
			stack: err.stack,
			uploadId: uploadId || 'none',
			filesProcessed: tempKeysToDelete.length
		});
		
		throw err;
	}
});
