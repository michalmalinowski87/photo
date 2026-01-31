/**
 * ZIP Merge - streams chunk ZIPs from S3, merges into final ZIP via unzipper + archiver
 * Invoked by Step Functions after all chunk workers complete
 */
import { lambdaLogger } from '../../../packages/logger/src';
import {
	S3Client,
	GetObjectCommand,
	DeleteObjectCommand,
	CreateMultipartUploadCommand,
	UploadPartCommand,
	CompleteMultipartUploadCommand,
	AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { Readable } from 'stream';
import { MERGE_PART_SIZE, MAX_PARTS } from '../../lib/src/zip-constants';
import { writeZipMetric } from '../../lib/src/zip-metrics';

const s3 = new S3Client({
	maxAttempts: 5,
	requestHandler: {
		requestTimeout: 60000,
		httpsAgent: { keepAlive: true, maxSockets: 50, keepAliveMsecs: 30000 }
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
	const metricsTable = envProc?.env?.ZIP_METRICS_TABLE as string;

	// Event from Step Function: state includes chunkResults from Map state
	const state = event;
	const { galleryId, orderId, type, runId, workerCount, finalFilesHash, selectedKeysHash } = state;
	const chunkResults = state.chunkResults ?? [];
	const isFinal = type === 'final';

	if (!bucket || !galleryId || !orderId) {
		throw new Error('Missing galleryId or orderId');
	}

	// Build ordered list of chunk ZIP keys from Map results
	const chunkZipKeys: string[] = [];
	for (let i = 0; i < workerCount; i++) {
		const r = chunkResults.find((c: any) => c.chunkIndex === i);
		if (r?.chunkZipKey) chunkZipKeys.push(r.chunkZipKey);
	}
	if (chunkZipKeys.length === 0) {
		throw new Error('No chunk ZIP keys found in merge input');
	}

	const zipKey = isFinal
		? `galleries/${galleryId}/orders/${orderId}/final-zip/gallery-${galleryId}-order-${orderId}-final.zip`
		: `galleries/${galleryId}/zips/${orderId}.zip`;

	logger?.info('Merge started', { galleryId, orderId, chunkCount: chunkZipKeys.length, zipKey });

	let uploadId: string | undefined;
	try {
		// Get gallery expiration for final ZIP
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
		if (!uploadId) throw new Error('Failed to create multipart upload');

		const archive = archiver('zip', { store: true });
		let parts: MultipartPart[] = [];
		let currentPartNumber = 1;
		let currentPartBuffer = Buffer.alloc(0);
		let zipTotalSize = 0;
		let lastUploadPromise = Promise.resolve<void>(undefined);
		let archiveError: Error | null = null;

		archive.on('error', (err: Error) => {
			logger?.error('Archive error', {}, err);
			archiveError = err;
		});
		archive.on('data', (chunk: Buffer) => {
			if (archiveError) return;
			zipTotalSize += chunk.length;
			currentPartBuffer = Buffer.concat([currentPartBuffer, chunk]);
			while (currentPartBuffer.length >= MERGE_PART_SIZE) {
				const partData = currentPartBuffer.slice(0, MERGE_PART_SIZE);
				currentPartBuffer = currentPartBuffer.slice(MERGE_PART_SIZE);
				const partNum = currentPartNumber;
				lastUploadPromise = lastUploadPromise.then(async () => {
					if (archiveError) throw archiveError;
					const resp = await s3.send(new UploadPartCommand({
						Bucket: bucket,
						Key: zipKey,
						UploadId: uploadId,
						PartNumber: partNum,
						Body: partData
					}));
					if (!resp.ETag) throw new Error(`No ETag part ${partNum}`);
					parts.push({ partNumber: partNum, etag: resp.ETag });
					if (partNum >= MAX_PARTS) throw new Error(`Exceeds ${MAX_PARTS} parts`);
				});
				currentPartNumber++;
			}
		});

		// Sequential chunks: parallel caused 2.5x slowdown (archiver contention, extra buffering)
		for (const chunkKey of chunkZipKeys) {
			const getResp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: chunkKey }));
			const body = getResp.Body as Readable;
			if (!body) continue;

			const parser = unzipper.Parse();
			body.pipe(parser);
			parser.on('entry', (entry: any) => {
				if (entry.type === 'Directory') {
					entry.autodrain();
					return;
				}
				archive.append(entry, { name: entry.path });
			});
			await new Promise<void>((resolve, reject) => {
				parser.on('close', resolve).on('error', reject);
			});
		}

		await archive.finalize();
		await lastUploadPromise;

		if (currentPartBuffer.length > 0) {
			const resp = await s3.send(new UploadPartCommand({
				Bucket: bucket,
				Key: zipKey,
				UploadId: uploadId!,
				PartNumber: currentPartNumber,
				Body: currentPartBuffer
			}));
			if (!resp.ETag) throw new Error('No ETag final part');
			parts.push({ partNumber: currentPartNumber, etag: resp.ETag });
		}

		parts.sort((a, b) => a.partNumber - b.partNumber);
		await s3.send(new CompleteMultipartUploadCommand({
			Bucket: bucket,
			Key: zipKey,
			UploadId: uploadId!,
			MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) }
		}));

		// Delete temp chunks
		for (const chunkKey of chunkZipKeys) {
			try {
				await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: chunkKey }));
			} catch (e) {
				logger?.warn('Failed to delete temp chunk', { chunkKey });
			}
		}

		// Clear generating flags
		if (ordersTable) {
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
		}

		const durationMs = Date.now() - startTime;
		if (metricsTable) {
			await writeZipMetric(metricsTable, {
				runId,
				phase: 'merge',
				galleryId,
				orderId,
				type: isFinal ? 'final' : 'original',
				filesCount: chunkResults.reduce((s: number, c: any) => s + (c.filesAdded ?? 0), 0),
				zipSizeBytes: zipTotalSize,
				workerCount,
				durationMs,
				bottleneck: 'merge',
				config: { memoryMB: 3008, timeoutSec: 900, concurrentDownloads: 0, partSizeMB: 50 },
				success: true
			}, logger);
		}

		logger?.info('Merge completed', { galleryId, orderId, zipSizeBytes: zipTotalSize, durationMs });
		return { zipKey, zipSizeBytes: zipTotalSize, durationMs };
	} catch (err: any) {
		if (uploadId) {
			try {
				await s3.send(new AbortMultipartUploadCommand({
					Bucket: bucket,
					Key: zipKey,
					UploadId: uploadId
				}));
			} catch {}
		}
		if (metricsTable && runId) {
			await writeZipMetric(metricsTable, {
				runId,
				phase: 'merge',
				galleryId,
				orderId,
				type: isFinal ? 'final' : 'original',
				filesCount: 0,
				workerCount,
				durationMs: Date.now() - startTime,
				bottleneck: 'merge',
				config: { memoryMB: 3008, timeoutSec: 900, concurrentDownloads: 0, partSizeMB: 50 },
				success: false,
				error: err.message
			}, logger);
		}
		throw err;
	}
});
