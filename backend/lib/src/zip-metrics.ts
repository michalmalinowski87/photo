/**
 * ZIP generation metrics - write to DynamoDB for performance tracking and bottleneck analysis
 */
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export type ZipPhase = 'single' | `chunk#${number}` | 'merge';

export interface ZipMetricConfig {
	memoryMB: number;
	timeoutSec: number;
	concurrentDownloads: number;
	partSizeMB: number;
	/** Merge-only: concurrent chunk processing (S3 GET + unzipper) */
	concurrentChunks?: number;
}

export interface ZipMetricInput {
	runId: string;
	phase: ZipPhase;
	galleryId: string;
	orderId: string;
	type: 'original' | 'final';
	filesCount: number;
	zipSizeBytes?: number;
	workerCount?: number;
	chunkIndex?: number;
	durationMs: number;
	bottleneck?: 'worker' | 'merge' | 's3_read' | 's3_write' | 'none';
	config: ZipMetricConfig;
	success: boolean;
	error?: string;
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 3 }));

const TTL_DAYS = 90;

/**
 * Write a ZIP generation metric to DynamoDB
 */
export async function writeZipMetric(
	tableName: string,
	input: ZipMetricInput,
	logger?: { info?: (msg: string, meta?: object) => void; error?: (msg: string, meta?: object, err?: unknown) => void }
): Promise<void> {
	const now = Date.now();
	const ttl = Math.floor(now / 1000) + TTL_DAYS * 24 * 60 * 60;

	const record = {
		runId: input.runId,
		phase: input.phase,
		galleryId: input.galleryId,
		orderId: input.orderId,
		type: input.type,
		filesCount: input.filesCount,
		zipSizeBytes: input.zipSizeBytes,
		workerCount: input.workerCount,
		chunkIndex: input.chunkIndex,
		durationMs: input.durationMs,
		bottleneck: input.bottleneck,
		config: input.config,
		success: input.success,
		error: input.error,
		timestamp: now,
		ttl,
		// GSI galleryIdOrderIdTimestamp: PK=galleryIdOrderId, SK=timestamp
		galleryIdOrderId: `${input.galleryId}#${input.orderId}`,
		// GSI typeTimestamp uses type as PK, timestamp as SK
	};

	try {
		await ddb.send(new PutCommand({
			TableName: tableName,
			Item: record
		}));
		logger?.info?.('Wrote ZIP metric', { runId: input.runId, phase: input.phase });
	} catch (err: unknown) {
		logger?.error?.('Failed to write ZIP metric', { runId: input.runId, phase: input.phase }, err);
		// Don't throw - metrics are best-effort, don't fail the main flow
	}
}
