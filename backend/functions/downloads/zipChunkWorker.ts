/**
 * ZIP Chunk Worker - copies raw files to temp prefix
 * Invoked by Step Functions Map state
 * Copies raw files to temp prefix for merge Lambda to stream directly into final ZIP
 */
import { lambdaLogger } from '../../../packages/logger/src';
import {
	S3Client,
	GetObjectCommand,
	PutObjectCommand
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import pLimit from 'p-limit';
import { CONCURRENT_COPIES } from '../../lib/src/zip-constants';

const s3 = new S3Client({
	maxAttempts: 5,
	requestStreamBufferSize: 65536, // Buffer stream chunks to meet S3's 8KB minimum chunk size requirement
	requestHandler: {
		requestTimeout: 5 * 60 * 1000,
		httpsAgent: { keepAlive: true, maxSockets: 100, keepAliveMsecs: 30000 }
	}
});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const startTime = Date.now();
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	const { galleryId, orderId, chunkIndex, keys, type, runId, workerCount } = event;
	const isFinal = type === 'final';

	// Input validation
	if (!bucket || !galleryId || !orderId || chunkIndex === undefined || !keys || !Array.isArray(keys) || !runId) {
		throw new Error('Missing required fields: bucket, galleryId, orderId, chunkIndex, keys, or runId');
	}
	
	if (typeof chunkIndex !== 'number' || chunkIndex < 0) {
		throw new Error(`Invalid chunkIndex: ${chunkIndex}`);
	}
	
	if (keys.length === 0) {
		throw new Error(`Empty keys array for chunk ${chunkIndex}`);
	}
	
	if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
		throw new Error(`Invalid runId format: ${runId}`);
	}

	const s3Prefix = isFinal
		? `galleries/${galleryId}/final/${orderId}/`
		: `galleries/${galleryId}/originals/`;
	const tempPrefix = `galleries/${galleryId}/tmp/${orderId}/${runId}/chunk-${chunkIndex}/`;

	const validKeys = keys.filter((k: string) => k && typeof k === 'string' && !k.includes('/previews/') && !k.includes('/thumbs/'));

	logger?.info('Chunk worker started', {
		galleryId,
		orderId,
		chunkIndex,
		keysCount: keys.length,
		validKeysCount: validKeys.length,
		tempPrefix,
		runId
	});
	if (validKeys.length === 0) {
		throw new Error(`No valid keys in chunk ${chunkIndex}`);
	}

	let filesAdded = 0;
	let totalBytesAdded = 0;

	const copyFile = async (key: string, retries = 0): Promise<boolean> => {
		const srcKey = s3Prefix + key;
		const destKey = tempPrefix + key;
		try {
			const getResp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: srcKey }));
			const contentLength = getResp.ContentLength ?? 0;
			if (!getResp.Body || contentLength === 0) return false;
			
			const body = getResp.Body as Readable;
			// Better error handling - destroy stream on error to free resources
			body.on?.('error', (err) => {
				logger?.warn('Source stream error', { key, error: err.message });
				body.destroy(err);
			});
			
			// Use PutObject with stream - S3 SDK handles multipart automatically for large files
			await s3.send(new PutObjectCommand({
				Bucket: bucket,
				Key: destKey,
				Body: body,
				ContentLength: contentLength,
				ContentType: getResp.ContentType,
				Metadata: getResp.Metadata,
				// Use Express One Zone storage class if available (faster, higher cost)
				// StorageClass: 'EXPRESS_ONEZONE' // Uncomment when Express bucket is configured
			}));
			
			filesAdded++;
			totalBytesAdded += contentLength;
			return true;
		} catch (err: any) {
			if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
				logger?.warn('File not found', { key, srcKey });
				return false;
			}
			const retryable = ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'TimeoutError', 'RequestTimeout'].some(
				c => err.code === c || err.name === c || err.message?.includes(c)
			);
			if (retryable && retries < 3) {
				const backoffMs = 1000 * Math.pow(2, retries);
				logger?.warn('Retrying copy', { key, retry: retries + 1, backoffMs });
				await new Promise(r => setTimeout(r, backoffMs));
				return copyFile(key, retries + 1);
			}
			logger?.error(`Failed to copy ${key} after ${retries} retries`, { error: err.message, name: err.name });
			throw err;
		}
	};

	try {
		const limit = pLimit(CONCURRENT_COPIES);
		const copyResults = await Promise.allSettled(
			validKeys.map((k: string) => limit(() => copyFile(k)))
		);
		
		// Count successful copies
		const successful = copyResults.filter(r => r.status === 'fulfilled' && r.value === true).length;
		const failed = copyResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === false)).length;
		
		if (failed > 0) {
			logger?.warn('Some files failed to copy', { 
				chunkIndex, 
				failed, 
				successful, 
				total: validKeys.length 
			});
		}

		if (filesAdded === 0) {
			throw new Error(`No files copied in chunk ${chunkIndex} (attempted ${validKeys.length} files)`);
		}
		
		// Warn if significant number of files failed
		if (failed > validKeys.length * 0.1) {
			logger?.warn('High failure rate in chunk', { 
				chunkIndex, 
				failed, 
				successful, 
				total: validKeys.length,
				failureRate: `${((failed / validKeys.length) * 100).toFixed(1)}%`
			});
		}

		const durationMs = Date.now() - startTime;

		logger?.info('Chunk worker completed', {
			galleryId,
			orderId,
			chunkIndex,
			filesAdded,
			totalBytesAdded,
			attempted: validKeys.length,
			durationMs
		});

		return {
			chunkIndex,
			filesAdded,
			durationMs
		};
	} catch (err: any) {
		throw err;
	}
});
