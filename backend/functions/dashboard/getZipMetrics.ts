/**
 * ZIP generation metrics API - query DynamoDB ZipMetrics table for performance analysis
 */
import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 3 }));

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
	const galleryId = qs.galleryId;
	const orderId = qs.orderId;
	const typeFilter = qs.type; // 'final' | 'original'
	const limit = Math.min(parseInt(qs.limit || '100', 10), 500);

	try {
		let items: any[] = [];

		if (galleryId && orderId) {
			// Query by galleryId#orderId
			const pk = `${galleryId}#${orderId}`;
			const result = await ddb.send(new QueryCommand({
				TableName: tableName,
				IndexName: 'galleryIdOrderIdTimestamp-index',
				KeyConditionExpression: 'galleryIdOrderId = :pk AND #ts BETWEEN :from AND :to',
				ExpressionAttributeNames: { '#ts': 'timestamp' },
				ExpressionAttributeValues: { ':pk': pk, ':from': fromTs, ':to': toTs },
				Limit: limit,
				ScanIndexForward: false
			}));
			items = result.Items || [];
		} else if (typeFilter === 'final' || typeFilter === 'original') {
			// Query by type
			const result = await ddb.send(new QueryCommand({
				TableName: tableName,
				IndexName: 'typeTimestamp-index',
				KeyConditionExpression: '#t = :type AND #ts BETWEEN :from AND :to',
				ExpressionAttributeNames: { '#t': 'type', '#ts': 'timestamp' },
				ExpressionAttributeValues: { ':type': typeFilter, ':from': fromTs, ':to': toTs },
				Limit: limit,
				ScanIndexForward: false
			}));
			items = result.Items || [];
		} else {
			// Scan with timestamp filter (fallback - less efficient)
			let lastKey: any;
			do {
				const result = await ddb.send(new ScanCommand({
					TableName: tableName,
					FilterExpression: '#ts BETWEEN :from AND :to',
					ExpressionAttributeNames: { '#ts': 'timestamp' },
					ExpressionAttributeValues: { ':from': fromTs, ':to': toTs },
					Limit: limit,
					ExclusiveStartKey: lastKey
				}));
				items.push(...(result.Items || []));
				lastKey = result.LastEvaluatedKey;
				if (items.length >= limit) break;
			} while (lastKey);
			items = items.slice(0, limit);
			items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
		}

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				metrics: items,
				count: items.length,
				from: fromTs,
				to: toTs
			})
		};
	} catch (err: any) {
		logger?.error('Failed to fetch ZIP metrics', { error: err.message }, err);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to fetch metrics', message: err.message })
		};
	}
});
