/**
 * ZIP Chunk Worker - creates one chunk ZIP from a subset of keys, uploads to S3 tmp
 * Invoked by Step Functions Map state
 */
import { lambdaLogger } from '../../../packages/logger/src';
import {
	S3Client,
	GetObjectCommand,
	CreateMultipartUploadCommand,
	UploadPartCommand,
	CompleteMultipartUploadCommand,
	AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';
import archiver from 'archiver';
import { Readable } from 'stream';
import pLimit from 'p-limit';
import { PART_SIZE, MAX_PARTS, CONCURRENT_DOWNLOADS } from '../../lib/src/zip-constants';
import { writeZipMetric } from '../../lib/src/zip-metrics';

const s3 = new S3Client({
	maxAttempts: 5,
	requestHandler: {
		requestTimeout: 60000,
		httpsAgent: { keepAlive: true, maxSockets: 50, keepAliveMsecs: 30000 }
	}
});

interface MultipartPart {
	partNumber: number;
	etag: string;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const startTime = Date.now();
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const metricsTable = envProc?.env?.ZIP_METRICS_TABLE as string;

	const { galleryId, orderId, chunkIndex, keys, type, runId, workerCount } = event;
	const isFinal = type === 'final';

	if (!bucket || !galleryId || !orderId || chunkIndex === undefined || !keys || !Array.isArray(keys)) {
		throw new Error('Missing required fields: galleryId, orderId, chunkIndex, keys');
	}

	const chunkZipKey = `galleries/${galleryId}/zips/tmp/${orderId}-chunk-${chunkIndex}.zip`;
	const s3Prefix = isFinal
		? `galleries/${galleryId}/final/${orderId}/`
		: `galleries/${galleryId}/originals/`;

	logger?.info('Chunk worker started', {
		galleryId,
		orderId,
		chunkIndex,
		keysCount: keys.length,
		chunkZipKey
	});

	const validKeys = keys.filter((k: string) => k && typeof k === 'string' && !k.includes('/previews/') && !k.includes('/thumbs/'));
	if (validKeys.length === 0) {
		throw new Error(`No valid keys in chunk ${chunkIndex}`);
	}

	let uploadId: string | undefined;
	try {
	const createMultipartResponse = await s3.send(new CreateMultipartUploadCommand({
		Bucket: bucket,
		Key: chunkZipKey,
		ContentType: 'application/zip',
		StorageClass: 'STANDARD'
	}));
	uploadId = createMultipartResponse.UploadId;
	if (!uploadId) throw new Error('Failed to create multipart upload');

	let parts: MultipartPart[] = [];
	let currentPartNumber = 1;
	let currentPartBuffer = Buffer.alloc(0);
	let zipTotalSize = 0;
	let lastUploadPromise = Promise.resolve<void>(undefined);
	let filesAdded = 0;
	let totalBytesAdded = 0;
	let archiveError: Error | null = null;

	const archive = archiver('zip', { store: true });
	archive.on('error', (err: Error) => {
		logger?.error('Archive error', {}, err);
		archiveError = err;
	});
	archive.on('warning', (err: Error & { code?: string }) => {
		if (err.code !== 'ENOENT') archiveError = err;
	});
	archive.on('data', (chunk: Buffer) => {
		if (archiveError) return;
		zipTotalSize += chunk.length;
		currentPartBuffer = Buffer.concat([currentPartBuffer, chunk]);
		while (currentPartBuffer.length >= PART_SIZE) {
			const partData = currentPartBuffer.slice(0, PART_SIZE);
			currentPartBuffer = currentPartBuffer.slice(PART_SIZE);
			const partNum = currentPartNumber;
			lastUploadPromise = lastUploadPromise.then(async () => {
				if (archiveError) throw archiveError;
				const resp = await s3.send(new UploadPartCommand({
					Bucket: bucket,
					Key: chunkZipKey,
					UploadId: uploadId,
					PartNumber: partNum,
					Body: partData
				}));
				if (!resp.ETag) throw new Error(`No ETag for part ${partNum}`);
				parts.push({ partNumber: partNum, etag: resp.ETag });
				if (partNum >= MAX_PARTS) throw new Error(`Exceeds ${MAX_PARTS} parts`);
			});
			currentPartNumber++;
		}
	});

	const addFile = async (key: string, retries = 0): Promise<boolean> => {
		const s3Key = s3Prefix + key;
		try {
			const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
			if (!resp.Body || (resp.ContentLength ?? 0) === 0) return false;
			const stream = resp.Body as Readable;
			stream.on('error', () => stream.destroy());
			archive.append(stream, { name: key });
			filesAdded++;
			totalBytesAdded += resp.ContentLength ?? 0;
			return true;
		} catch (err: any) {
			if (err.name === 'NoSuchKey' || err.name === 'NotFound') return false;
			const retryable = ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'TimeoutError'].some(c => err.code === c || err.name === c);
			if (retryable && retries < 3) {
				await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries)));
				return addFile(key, retries + 1);
			}
			logger?.error(`Failed to add ${key}`, { error: err.message });
			return false;
		}
	};

	const limit = pLimit(CONCURRENT_DOWNLOADS);
	await Promise.all(validKeys.map((k: string) => limit(() => addFile(k))));

	if (filesAdded === 0) throw new Error(`No files added in chunk ${chunkIndex}`);

	await archive.finalize();
	await lastUploadPromise;

	if (currentPartBuffer.length > 0) {
		const resp = await s3.send(new UploadPartCommand({
			Bucket: bucket,
			Key: chunkZipKey,
			UploadId: uploadId,
			PartNumber: currentPartNumber,
			Body: currentPartBuffer
		}));
		if (!resp.ETag) throw new Error('No ETag for final part');
		parts.push({ partNumber: currentPartNumber, etag: resp.ETag });
	}

	parts.sort((a, b) => a.partNumber - b.partNumber);
	await s3.send(new CompleteMultipartUploadCommand({
		Bucket: bucket,
		Key: chunkZipKey,
		UploadId: uploadId,
		MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) }
	}));

	const durationMs = Date.now() - startTime;
	if (metricsTable) {
		await writeZipMetric(metricsTable, {
			runId,
			phase: `chunk#${chunkIndex}` as any,
			galleryId,
			orderId,
			type: isFinal ? 'final' : 'original',
			filesCount: validKeys.length,
			zipSizeBytes: zipTotalSize,
			workerCount,
			chunkIndex,
			durationMs,
			bottleneck: 'worker',
			config: { memoryMB: 1024, timeoutSec: 900, concurrentDownloads: CONCURRENT_DOWNLOADS, partSizeMB: 15 },
			success: true
		}, logger);
	}

	logger?.info('Chunk worker completed', {
		galleryId,
		orderId,
		chunkIndex,
		filesAdded,
		zipSizeBytes: zipTotalSize,
		durationMs
	});

	return {
		chunkIndex,
		chunkZipKey,
		filesAdded,
		zipSizeBytes: zipTotalSize,
		durationMs
	};
	} catch (err: any) {
		if (uploadId) {
			try {
				await s3.send(new AbortMultipartUploadCommand({
					Bucket: bucket,
					Key: chunkZipKey,
					UploadId: uploadId
				}));
			} catch {}
		}
		if (metricsTable && runId) {
			await writeZipMetric(metricsTable, {
				runId,
				phase: `chunk#${chunkIndex}` as any,
				galleryId,
				orderId,
				type: isFinal ? 'final' : 'original',
				filesCount: keys?.length ?? 0,
				workerCount,
				chunkIndex,
				durationMs: Date.now() - startTime,
				bottleneck: 'worker',
				config: { memoryMB: 1024, timeoutSec: 900, concurrentDownloads: CONCURRENT_DOWNLOADS, partSizeMB: 15 },
				success: false,
				error: err.message
			}, logger);
		}
		throw err;
	}
	});
