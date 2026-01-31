/**
 * ZIP Chunked Failure Handler - triggered by EventBridge when ZipChunkedStateMachine fails
 * Fetches execution input, clears generating flags, sets error state, and deletes temp files
 */
import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SFNClient, DescribeExecutionCommand } from '@aws-sdk/client-sfn';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 5 }), {
	marshallOptions: {
		removeUndefinedValues: true // Remove undefined values to avoid DynamoDB errors
	}
});
const sfn = new SFNClient({ maxAttempts: 3 });
const s3 = new S3Client({ maxAttempts: 5 });

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const zipStateMachineArn = envProc?.env?.ZIP_STEP_FUNCTION_ARN as string;

	if (!ordersTable) {
		logger?.error('ORDERS_TABLE not set');
		throw new Error('Missing ORDERS_TABLE');
	}

	// EventBridge event: detail-type = "Step Functions Execution Status Change", detail.status = "FAILED"
	// executionArn: detail.executionArn or resources[0] (ARN of failed execution)
	const detail = event?.detail as {
		status?: string;
		stateMachineArn?: string;
		error?: string;
		cause?: string;
		input?: string;
		executionArn?: string;
	} | undefined;
	const resources = (event?.resources as string[] | undefined) || [];
	const executionArn = detail?.executionArn ?? resources[0];

	if (!executionArn || detail?.status !== 'FAILED') {
		logger?.info('Ignoring non-failure event or missing execution ARN', { executionArn, status: detail?.status });
		return { ok: false, reason: 'not_a_failure' };
	}

	// Only handle our ZIP chunked state machine
	if (zipStateMachineArn && detail?.stateMachineArn && !detail.stateMachineArn.includes('ZipChunkedStateMachine')) {
		logger?.info('Ignoring non-ZIP Step Function failure', { stateMachineArn: detail.stateMachineArn });
		return { ok: false, reason: 'wrong_state_machine' };
	}

	// Get execution input - EventBridge detail may include it, otherwise fetch via API
	let input: { galleryId?: string; orderId?: string; type?: string; runId?: string };
	if (detail?.input) {
		try {
			input = JSON.parse(detail.input) as any;
		} catch {
			input = {};
		}
	} else {
		try {
			const desc = await sfn.send(new DescribeExecutionCommand({ executionArn }));
			input = (JSON.parse(desc.input || '{}') as any) || {};
		} catch (err: any) {
			logger?.error('Failed to describe execution', { executionArn, error: err.message });
			throw err;
		}
	}

	const galleryId = input?.galleryId as string;
	const orderId = input?.orderId as string;
	const runId = input?.runId as string | undefined;
	const type = (input?.type as string) || 'original';
	const isFinal = type === 'final';
	const errorName = detail?.error as string;
	const cause = detail?.cause as string;

	if (!galleryId || !orderId) {
		logger?.error('Missing galleryId or orderId in execution input', { input });
		return { ok: false, reason: 'missing_context' };
	}

	const errorMessage = (cause || errorName || 'ZIP generation failed (chunked flow)').substring(0, 500);

	logger?.info('Handling ZIP chunked failure', {
		galleryId,
		orderId,
		type,
		runId,
		errorName,
		errorMessage: errorMessage.substring(0, 200)
	});

	const errorFinal = {
		galleryId,
		orderId,
		timestamp: Date.now(),
		attempts: 1,
		error: {
			name: errorName || 'StepFunctionError',
			message: errorMessage
		},
		details: []
	};

	const errorFinalField = isFinal ? 'finalZipErrorFinal' : 'zipErrorFinal';
	const finalizedField = isFinal ? 'finalZipErrorFinalized' : 'zipErrorFinalized';
	const removeGenerating = isFinal
		? 'REMOVE finalZipGenerating, finalZipGeneratingSince'
		: 'REMOVE zipGenerating, zipGeneratingSince';

	try {
	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId },
		UpdateExpression: `${removeGenerating} SET ${errorFinalField} = :errorFinal, ${finalizedField} = :finalized`,
		ExpressionAttributeValues: {
			':errorFinal': errorFinal,
			':finalized': true
		}
	}));

	// Clean up temp files (workers copy raw files to temp prefix)
	if (bucket && runId) {
		const tempPrefix = `galleries/${galleryId}/tmp/${orderId}/${runId}/`;
		try {
			let continuationToken: string | undefined;
			const keysToDelete: string[] = [];
			do {
				const listResp = await s3.send(new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: tempPrefix,
					ContinuationToken: continuationToken,
					MaxKeys: 1000
				}));
				for (const obj of listResp.Contents ?? []) {
					if (obj.Key && !obj.Key.endsWith('/')) keysToDelete.push(obj.Key);
				}
				continuationToken = listResp.NextContinuationToken;
			} while (continuationToken);
			for (let i = 0; i < keysToDelete.length; i += 1000) {
				const batch = keysToDelete.slice(i, i + 1000);
				await s3.send(new DeleteObjectsCommand({
					Bucket: bucket,
					Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true }
				}));
			}
			if (keysToDelete.length > 0) logger?.info('Cleaned temp files', { count: keysToDelete.length, prefix: tempPrefix });
		} catch (e: any) {
			logger?.warn('Failed to clean temp files', { prefix: tempPrefix, error: e.message });
		}
	}

	logger?.info('Cleared generating flags and set error state', { galleryId, orderId, isFinal });

	return { ok: true, galleryId, orderId, type };
	} catch (err: any) {
		logger?.error('Failed to update order with ZIP error state', {
			galleryId,
			orderId,
			errorName: err.name,
			errorMessage: err.message
		}, err);
		throw err; // Re-throw so EventBridge can retry; DLQ captures after retries
	}
});
