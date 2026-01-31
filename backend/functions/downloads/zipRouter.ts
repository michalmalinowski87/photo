/**
 * ZIP Router - dispatches to single createZip or chunked Step Function based on file count
 */
import { lambdaLogger } from '../../../packages/logger/src';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
import { getWorkerCount, splitIntoChunks, DEFAULT_CHUNK_THRESHOLD } from '../../lib/src/zip-constants';
import { nanoid } from 'nanoid';

const lambda = new LambdaClient({});
const sfn = new SFNClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const createZipFnName = envProc?.env?.CREATE_ZIP_FN_NAME as string;
	const stepFunctionArn = envProc?.env?.ZIP_STEP_FUNCTION_ARN as string;
	const chunkThreshold = parseInt(envProc?.env?.ZIP_CHUNK_THRESHOLD || String(DEFAULT_CHUNK_THRESHOLD), 10);

	// Parse payload - same format as createZip (direct invoke or API Gateway)
	let payload: {
		galleryId: string;
		keys?: string[];
		orderId: string;
		type?: string;
		finalFilesHash?: string;
		selectedKeysHash?: string;
	};
	try {
		if (event.body) {
			payload = JSON.parse(event.body);
		} else {
			payload = event;
		}
	} catch {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Invalid payload format' })
		};
	}

	const { galleryId, keys, orderId, type, finalFilesHash, selectedKeysHash } = payload;
	const isFinal = type === 'final';

	if (!galleryId || !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or orderId' })
		};
	}

	// Determine file count: keys for original, must query for final (caller provides keys in payload for final if pre-fetched)
	let filesCount = 0;
	if (isFinal) {
		// For final, we need to get count - if keys provided use that, else we'd need to query (router avoids that)
		// Callers for final (onOrderDelivered) don't pass keys - they pass finalFilesHash. The Step Function
		// will need to fetch keys. For router we need file count. We'll need to add it to the payload from callers
		// or query here. Plan says router "checks file count" - for final, the caller (onOrderDelivered) has
		// allFinalImageRecords. We should pass filesCount in the payload from callers.
		// For now: if keys in payload use keys.length, else we need to query Images table.
		if (keys && Array.isArray(keys)) {
			filesCount = keys.length;
		} else {
			// Query for count - lightweight count query
			const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
			const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
			const imagesTable = envProc?.env?.IMAGES_TABLE as string;
			if (!imagesTable) {
				logger?.error('IMAGES_TABLE not set for final ZIP router');
				return { statusCode: 500, body: JSON.stringify({ error: 'Configuration error' }) };
			}
			const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
			let count = 0;
			let lastKey: any;
			do {
				const resp = await ddb.send(new QueryCommand({
					TableName: imagesTable,
					IndexName: 'galleryId-orderId-index',
					KeyConditionExpression: 'galleryId = :g AND orderId = :o',
					FilterExpression: '#t = :type',
					ExpressionAttributeNames: { '#t': 'type' },
					ExpressionAttributeValues: { ':g': galleryId, ':o': orderId, ':type': 'final' },
					Select: 'COUNT',
					Limit: 1000,
					ExclusiveStartKey: lastKey
				}));
				count += resp.Count ?? 0;
				lastKey = resp.LastEvaluatedKey;
			} while (lastKey);
			filesCount = count;
		}
	} else {
		filesCount = (keys && Array.isArray(keys)) ? keys.length : 0;
	}

	if (filesCount === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'No files to zip' })
		};
	}

	// Route: single or chunked
	if (filesCount <= chunkThreshold || !stepFunctionArn) {
		// Single Lambda path
		const payloadBytes = Buffer.from(JSON.stringify(payload));
		await lambda.send(new InvokeCommand({
			FunctionName: createZipFnName,
			Payload: payloadBytes,
			InvocationType: 'Event'
		}));
		logger?.info('Routed to single createZip', { galleryId, orderId, filesCount });
		return {
			statusCode: 202,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status: 'generating', path: 'single', filesCount })
		};
	}

	// Chunked path - start Step Function
	const runId = nanoid();
	const workerCount = getWorkerCount(filesCount);
	let chunkKeys: string[][];
	if (isFinal) {
		// Need to fetch keys for final - do it here so we can split
		if (keys && Array.isArray(keys) && keys.length === filesCount) {
			chunkKeys = splitIntoChunks(keys, workerCount);
		} else {
			const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
			const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
			const imagesTable = envProc?.env?.IMAGES_TABLE as string;
			const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
			let allKeys: string[] = [];
			let lastKey: any;
			do {
				const resp = await ddb.send(new QueryCommand({
					TableName: imagesTable,
					IndexName: 'galleryId-orderId-index',
					KeyConditionExpression: 'galleryId = :g AND orderId = :o',
					FilterExpression: '#t = :type',
					ExpressionAttributeNames: { '#t': 'type' },
					ExpressionAttributeValues: { ':g': galleryId, ':o': orderId, ':type': 'final' },
					ProjectionExpression: 'filename',
					Limit: 1000,
					ExclusiveStartKey: lastKey
				}));
				const items = resp.Items || [];
				allKeys.push(...items.map((r: any) => r.filename));
				lastKey = resp.LastEvaluatedKey;
			} while (lastKey);
			chunkKeys = splitIntoChunks(allKeys, workerCount);
		}
	} else {
		chunkKeys = splitIntoChunks(keys!, workerCount);
	}

	// Validate chunk distribution
	if (chunkKeys.length !== workerCount) {
		throw new Error(`Chunk count mismatch: expected ${workerCount} chunks, got ${chunkKeys.length}`);
	}
	
	const totalChunkedFiles = chunkKeys.reduce((sum, keys) => sum + keys.length, 0);
	if (totalChunkedFiles !== filesCount) {
		logger?.warn('File count mismatch in chunking', {
			expected: filesCount,
			chunked: totalChunkedFiles,
			workerCount
		});
	}
	
	const chunkItems = chunkKeys.map((keys, i) => ({ chunkIndex: i, keys }));
	
	try {
		const execResp = await sfn.send(new StartExecutionCommand({
			stateMachineArn: stepFunctionArn,
			input: JSON.stringify({
				galleryId,
				orderId,
				type: type || 'original',
				finalFilesHash: isFinal ? finalFilesHash : undefined,
				selectedKeysHash: !isFinal ? selectedKeysHash : undefined,
				runId,
				chunkItems,
				workerCount
			})
		}));
		
		if (!execResp.executionArn) {
			throw new Error('Step Function execution started but no execution ARN returned');
		}
		
		logger?.info('Started chunked Step Function', { 
			galleryId, 
			orderId, 
			runId, 
			workerCount, 
			filesCount,
			executionArn: execResp.executionArn
		});
	} catch (sfnErr: any) {
		logger?.error('Failed to start Step Function', {
			galleryId,
			orderId,
			error: sfnErr.message,
			name: sfnErr.name
		});
		throw new Error(`Failed to start ZIP generation: ${sfnErr.message}`);
	}

	logger?.info('Started chunked Step Function', { galleryId, orderId, runId, workerCount, filesCount });
	return {
		statusCode: 202,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ status: 'generating', path: 'chunked', runId, workerCount, filesCount })
	};
});
