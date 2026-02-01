#!/usr/bin/env node
/**
 * Analyze DynamoDB GSI usage and data distribution for cost optimization.
 *
 * Collects CloudWatch metrics for GSI read/write and optionally performs
 * lightweight data distribution analysis.
 *
 * Usage:
 *   STAGE=dev node scripts/analyze-gsi-usage.mjs [--metrics-only] [--data-distribution]
 *
 * Options:
 *   --metrics-only       Only fetch CloudWatch metrics (default: true if no other flag)
 *   --data-distribution  Also analyze data distribution (requires table access, more expensive)
 *   --days N             Number of days of metrics to fetch (default: 7)
 *
 * Requires: AWS credentials configured, STAGE env var for table name resolution
 */

import {
	CloudWatchClient,
	GetMetricStatisticsCommand,
	ListMetricsCommand
} from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const STAGE = process.env.STAGE || 'dev';
const DAYS = parseInt(process.env.DAYS || process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] || '7', 10);
const METRICS_ONLY = process.argv.includes('--metrics-only') || (!process.argv.includes('--data-distribution') && process.argv.length <= 2);
const DATA_DISTRIBUTION = process.argv.includes('--data-distribution');

const cloudWatch = new CloudWatchClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Table name patterns - CDK generates names like PhotoHub-{stage}-GalleriesTableXXXXXXXX
function tableNamePattern(logicalName) {
	// Match both AppStack-TableName-XXX and PhotoHub-{stage}-TableName patterns
	return new RegExp(`(AppStack|PhotoHub)[-\\w]*${logicalName}`);
}

const GSI_DEFINITIONS = [
	{ table: 'GalleriesTable', gsi: 'ownerId-index', purpose: 'List galleries by owner' },
	{ table: 'GalleriesTable', gsi: 'state-createdAt-index', purpose: 'Expiry: DRAFT galleries older than 3 days' },
	{ table: 'OrdersTable', gsi: 'ownerId-deliveryStatus-index', purpose: 'Orders by owner/dashboard' },
	{ table: 'OrdersTable', gsi: 'galleryId-deliveryStatus-index', purpose: 'Orders by gallery + status' },
	{ table: 'TransactionsTable', gsi: 'galleryId-status-index', purpose: 'PAID/UNPAID by gallery' },
	{ table: 'TransactionsTable', gsi: 'status-createdAt-index', purpose: 'Expiry: UNPAID wallet top-ups' },
	{ table: 'ClientsTable', gsi: 'ownerId-index', purpose: 'Clients by owner' },
	{ table: 'PackagesTable', gsi: 'ownerId-index', purpose: 'Packages by owner' },
	{ table: 'ImagesTable', gsi: 'galleryId-lastModified-index', purpose: 'Images by gallery, time-sorted' },
	{ table: 'ImagesTable', gsi: 'galleryId-orderId-index', purpose: 'Final images by order (sparse)' }
];

async function resolveTableNames() {
	const list = await dynamoClient.send(new ListTablesCommand({}));
	const names = list.TableNames || [];
	const resolved = {};

	for (const def of GSI_DEFINITIONS) {
		const pattern = tableNamePattern(def.table);
		const match = names.find((n) => pattern.test(n));
		if (match) {
			if (!resolved[def.table]) resolved[def.table] = match;
		}
	}
	return resolved;
}

async function getGsiMetrics(tableName, gsiName, metricName) {
	const endTime = new Date();
	const startTime = new Date();
	startTime.setDate(startTime.getDate() - DAYS);

	try {
		const cmd = new GetMetricStatisticsCommand({
			Namespace: 'AWS/DynamoDB',
			MetricName: metricName,
			Dimensions: [
				{ Name: 'TableName', Value: tableName },
				{ Name: 'GlobalSecondaryIndexName', Value: gsiName }
			],
			StartTime: startTime,
			EndTime: endTime,
			Period: 86400, // 1 day
			Statistics: ['Sum', 'Average', 'SampleCount']
		});
		const result = await cloudWatch.send(cmd);
		return result.Datapoints || [];
	} catch (err) {
		if (err.name === 'InvalidParameterValue' || err.message?.includes('dimension')) {
			return []; // GSI might not exist
		}
		throw err;
	}
}

async function fetchAllGsiMetrics(tableNames) {
	const results = [];
	for (const def of GSI_DEFINITIONS) {
		const tableName = tableNames[def.table];
		if (!tableName) continue;

		const [readDps, writeDps] = await Promise.all([
			getGsiMetrics(tableName, def.gsi, 'ConsumedReadCapacityUnits'),
			getGsiMetrics(tableName, def.gsi, 'ConsumedWriteCapacityUnits')
		]);

		const readSum = readDps.reduce((s, d) => s + (d.Sum || 0), 0);
		const writeSum = writeDps.reduce((s, d) => s + (d.Sum || 0), 0);

		results.push({
			table: def.table,
			gsi: def.gsi,
			purpose: def.purpose,
			readUnits: Math.round(readSum),
			writeUnits: Math.round(writeSum),
			days: DAYS
		});
	}
	return results;
}

async function analyzeDataDistribution(tableNames) {
	const findings = [];

	// Galleries: estimate % in DRAFT state
	const galleriesTable = tableNames.GalleriesTable;
	if (galleriesTable) {
		let total = 0;
		let draft = 0;
		let lastKey;
		do {
			const scan = await docClient.send(
				new ScanCommand({
					TableName: galleriesTable,
					ProjectionExpression: '#s',
					ExpressionAttributeNames: { '#s': 'state' },
					Limit: 500,
					ExclusiveStartKey: lastKey
				})
			);
			const items = scan.Items || [];
			total += items.length;
			draft += items.filter((i) => i.state === 'DRAFT').length;
			lastKey = scan.LastEvaluatedKey;
		} while (lastKey && total < 5000); // Cap at 5k for cost

		findings.push({
			table: 'GalleriesTable',
			metric: 'DRAFT percentage',
			value: total > 0 ? ((draft / total) * 100).toFixed(2) + '%' : 'N/A',
			sampleSize: total
		});
	}

	// Transactions: estimate % UNPAID WALLET_TOPUP
	const transactionsTable = tableNames.TransactionsTable;
	if (transactionsTable) {
		let total = 0;
		let unpaidTopup = 0;
		let lastKey;
		do {
			const scan = await docClient.send(
				new ScanCommand({
					TableName: transactionsTable,
					ProjectionExpression: '#st, #t',
					ExpressionAttributeNames: { '#st': 'status', '#t': 'type' },
					Limit: 500,
					ExclusiveStartKey: lastKey
				})
			);
			const items = scan.Items || [];
			total += items.length;
			unpaidTopup += items.filter((i) => i.status === 'UNPAID' && i.type === 'WALLET_TOPUP').length;
			lastKey = scan.LastEvaluatedKey;
		} while (lastKey && total < 5000);

		findings.push({
			table: 'TransactionsTable',
			metric: 'UNPAID WALLET_TOPUP percentage',
			value: total > 0 ? ((unpaidTopup / total) * 100).toFixed(2) + '%' : 'N/A',
			sampleSize: total
		});
	}

	return findings;
}

async function main() {
	console.log('DynamoDB GSI Cost Optimization Analysis');
	console.log('=======================================\n');
	console.log(`Stage: ${STAGE}, Metrics period: ${DAYS} days\n`);

	const tableNames = await resolveTableNames();
	if (Object.keys(tableNames).length === 0) {
		console.warn('No matching DynamoDB tables found. Ensure STAGE is correct and stack is deployed.');
		process.exit(1);
	}
	console.log('Resolved tables:', Object.entries(tableNames).map(([k, v]) => `${k} -> ${v}`).join(', '));
	console.log('');

	const metrics = await fetchAllGsiMetrics(tableNames);

	console.log('GSI CloudWatch Metrics (ConsumedReadCapacityUnits + ConsumedWriteCapacityUnits)');
	console.log('--------------------------------------------------------------------------------');
	metrics.forEach((m) => {
		const total = m.readUnits + m.writeUnits;
		const lowUsage = total < 100 && (m.gsi.includes('state-createdAt') || m.gsi.includes('status-createdAt'));
		const flag = lowUsage ? ' [LOW USAGE - CANDIDATE FOR REMOVAL]' : '';
		console.log(`${m.table} / ${m.gsi}: read=${m.readUnits} write=${m.writeUnits} total=${total}${flag}`);
		console.log(`  Purpose: ${m.purpose}`);
	});

	if (DATA_DISTRIBUTION) {
		console.log('\nData Distribution Analysis (sampled)');
		console.log('-----------------------------------');
		const dist = await analyzeDataDistribution(tableNames);
		dist.forEach((d) => {
			console.log(`${d.table}: ${d.metric} = ${d.value} (sample n=${d.sampleSize})`);
		});
	}

	console.log('\nRecommendations:');
	console.log('- Low-usage GSIs (state-createdAt-index, status-createdAt-index): evaluate removal');
	console.log('- Run with --data-distribution to estimate DRAFT/UNPAID percentages');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
