/**
 * ZIP Chunked Failure Handler - triggered by EventBridge when ZipChunkedStateMachine fails
 * Fetches execution input, clears generating flags, and sets error state so UI shows failure + retry option
 */
import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SFNClient, DescribeExecutionCommand } from '@aws-sdk/client-sfn';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 5 }));
const sfn = new SFNClient({ maxAttempts: 3 });

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipStateMachineArn = envProc?.env?.ZIP_STEP_FUNCTION_ARN as string;

	if (!ordersTable) {
		logger?.error('ORDERS_TABLE not set');
		throw new Error('Missing ORDERS_TABLE');
	}

	// EventBridge event: detail-type = "Step Functions Execution Status Change", detail.status = "FAILED"
	const detail = event?.detail as {
		status?: string;
		stateMachineArn?: string;
		error?: string;
		cause?: string;
		input?: string;
		executionArn?: string;
	} | undefined;
	const resources = (event?.resources as string[] | undefined) || [];
	const executionArn = detail?.executionArn || resources[0];

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
	let input: { galleryId?: string; orderId?: string; type?: string };
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
	const type = (input?.type as string) || 'original';
	const isFinal = type === 'final';
	const errorName = detail?.error as string;
	const cause = detail?.cause as string;

	if (!galleryId || !orderId) {
		logger?.error('Missing galleryId or orderId in execution input', { input });
		return { ok: false, reason: 'missing_context' };
	}

	const errorMessage = cause || errorName || 'ZIP generation failed (chunked flow)';

	logger?.info('Handling ZIP chunked failure', {
		galleryId,
		orderId,
		type,
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
			message: errorMessage,
			stack: undefined
		},
		details: []
	};

	const errorFinalField = isFinal ? 'finalZipErrorFinal' : 'zipErrorFinal';
	const finalizedField = isFinal ? 'finalZipErrorFinalized' : 'zipErrorFinalized';
	const removeGenerating = isFinal
		? 'REMOVE finalZipGenerating, finalZipGeneratingSince'
		: 'REMOVE zipGenerating, zipGeneratingSince';

	await ddb.send(new UpdateCommand({
		TableName: ordersTable,
		Key: { galleryId, orderId },
		UpdateExpression: `${removeGenerating} SET ${errorFinalField} = :errorFinal, ${finalizedField} = :finalized`,
		ExpressionAttributeValues: {
			':errorFinal': errorFinal,
			':finalized': true
		}
	}));

	logger?.info('Cleared generating flags and set error state', { galleryId, orderId, isFinal });

	return { ok: true, galleryId, orderId, type };
});
