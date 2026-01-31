/**
 * ZIP generation metrics summary - aggregated statistics for bottleneck analysis
 */
import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 3 }));

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, idx)];
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const ownerId = getUserIdFromEvent(event);
	if (!ownerId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	const envProc = (globalThis as any).process;
	const tableName = envProc?.env?.ZIP_METRICS_TABLE as string;
	if (!tableName) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'ZIP_METRICS_TABLE not configured' })
		};
	}

	const qs = event.queryStringParameters || {};
	const fromTs = qs.from ? parseInt(qs.from, 10) : Date.now() - 7 * 24 * 60 * 60 * 1000;
	const toTs = qs.to ? parseInt(qs.to, 10) : Date.now();

	try {
		const items: any[] = [];
		let lastKey: any;
		do {
			const result = await ddb.send(new ScanCommand({
				TableName: tableName,
				FilterExpression: '#ts BETWEEN :from AND :to',
				ExpressionAttributeNames: { '#ts': 'timestamp' },
				ExpressionAttributeValues: { ':from': fromTs, ':to': toTs },
				ExclusiveStartKey: lastKey
			}));
			items.push(...(result.Items || []));
			lastKey = result.LastEvaluatedKey;
		} while (lastKey);

		// Compute per-run aggregates (group by runId)
		const byRun = new Map<string, any[]>();
		for (const item of items) {
			const rid = item.runId || 'unknown';
			if (!byRun.has(rid)) byRun.set(rid, []);
			byRun.get(rid)!.push(item);
		}

		const totalDurations: number[] = [];
		const successCount = { single: 0, chunked: 0, fail: 0 };
		const bottleneckCount: Record<string, number> = {};
		const byWorkerCount: Record<number, number[]> = {};
		const byFilesCount: Record<string, number[]> = {};

		for (const [runId, runItems] of byRun) {
			const phases = runItems as any[];
			const totalMs = phases.reduce((s, p) => s + (p.durationMs || 0), 0);
			totalDurations.push(totalMs);
			const anySuccess = phases.some((p: any) => p.success);
			const anyChunked = phases.some((p: any) => p.phase && p.phase !== 'single');
			if (anySuccess) {
				if (anyChunked) successCount.chunked++;
				else successCount.single++;
			} else successCount.fail++;

			for (const p of phases) {
				const bn = p.bottleneck || 'none';
				bottleneckCount[bn] = (bottleneckCount[bn] || 0) + 1;
				if (p.workerCount != null) {
					if (!byWorkerCount[p.workerCount]) byWorkerCount[p.workerCount] = [];
					byWorkerCount[p.workerCount].push(p.durationMs || 0);
				}
				if (p.filesCount != null) {
					const bucket = p.filesCount < 100 ? '<100' : p.filesCount < 500 ? '100-500' : '500+';
					if (!byFilesCount[bucket]) byFilesCount[bucket] = [];
					byFilesCount[bucket].push(p.durationMs || 0);
				}
			}
		}

		totalDurations.sort((a, b) => a - b);

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				from: fromTs,
				to: toTs,
				totalRuns: byRun.size,
				duration: {
					avgMs: totalDurations.length ? Math.round(totalDurations.reduce((a, b) => a + b, 0) / totalDurations.length) : 0,
					p50Ms: Math.round(percentile(totalDurations, 50)),
					p95Ms: Math.round(percentile(totalDurations, 95)),
					p99Ms: Math.round(percentile(totalDurations, 99))
				},
				successRate: byRun.size
					? Math.round((100 * (successCount.single + successCount.chunked)) / byRun.size)
					: 100,
				successBreakdown: successCount,
				bottleneckDistribution: bottleneckCount,
				byWorkerCount: Object.fromEntries(
					Object.entries(byWorkerCount).map(([k, v]) => [
						k,
						{ count: v.length, avgMs: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }
					])
				),
				byFilesBucket: Object.fromEntries(
					Object.entries(byFilesCount).map(([k, v]) => [
						k,
						{ count: v.length, avgMs: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }
					])
				)
			})
		};
	} catch (err: any) {
		logger?.error('Failed to compute ZIP metrics summary', { error: err.message }, err);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to compute summary', message: err.message })
		};
	}
});
