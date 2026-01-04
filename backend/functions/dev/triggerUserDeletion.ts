import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { createUserDeletionSchedule, cancelUserDeletionSchedule } from '../../lib/src/user-deletion-scheduler';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

/**
 * Dev endpoint to trigger user deletion immediately (skip 3-day wait)
 * Only available in development/staging environments
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const deletionLambdaArn = envProc?.env?.USER_DELETION_LAMBDA_ARN as string;
	const deletionFnName = envProc?.env?.USER_DELETION_FN_NAME as string;
	const scheduleRoleArn = envProc?.env?.USER_DELETION_SCHEDULE_ROLE_ARN as string;
	const dlqArn = envProc?.env?.USER_DELETION_DLQ_ARN as string;
	const stage = envProc?.env?.STAGE as string;

	// Only allow in dev/staging
	if (stage === 'prod') {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'This endpoint is not available in production' })
		};
	}

	if (!usersTable || !deletionLambdaArn) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const userId = event?.pathParameters?.userId || getUserIdFromEvent(event);
	if (!userId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing userId' })
		};
	}

	const body = event?.body ? JSON.parse(event.body) : {};
	const immediate = body.immediate !== false; // Default to true, can be set to false to schedule normally
	const minutesFromNow = body.minutesFromNow || (immediate ? 1 : 0); // Default 1 minute if immediate

	// Get user
	const userResult = await ddb.send(new GetCommand({
		TableName: usersTable,
		Key: { userId }
	}));

	if (!userResult.Item) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'User not found' })
		};
	}

	const user = userResult.Item as any;

	// Calculate deletion time
	const deletionScheduledAt = new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();

	// Update user status
	const updateData: any = {
		...user,
		status: 'pendingDeletion',
		deletionScheduledAt,
		deletionReason: 'manual',
		deletionRequestedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};

	await ddb.send(new PutCommand({
		TableName: usersTable,
		Item: updateData
	}));

	// Create EventBridge schedule (or invoke immediately)
	if (immediate && minutesFromNow <= 1) {
		// Invoke Lambda directly for immediate deletion
		try {
			// Use function name if available, otherwise extract from ARN
			const functionName = deletionFnName || (deletionLambdaArn.includes(':function:')
				? deletionLambdaArn.split(':function:')[1]?.split('/')[0] || deletionLambdaArn
				: deletionLambdaArn);
			
			await lambda.send(new InvokeCommand({
				FunctionName: functionName,
				InvocationType: 'Event', // Async invocation
				Payload: JSON.stringify({ userId })
			}));
			logger.info('Invoked user deletion Lambda immediately', { userId });
		} catch (lambdaErr: any) {
			logger.error('Failed to invoke deletion Lambda', {
				error: lambdaErr.message,
				userId
			});
			// Fall back to scheduling
			if (scheduleRoleArn) {
				await createUserDeletionSchedule(userId, deletionScheduledAt, deletionLambdaArn, scheduleRoleArn, dlqArn);
			}
		}
	} else if (scheduleRoleArn) {
		// Create schedule
		await createUserDeletionSchedule(userId, deletionScheduledAt, deletionLambdaArn, scheduleRoleArn, dlqArn);
		logger.info('Created user deletion schedule', { userId, deletionScheduledAt });
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			userId,
			deletionScheduledAt,
			immediate,
			message: immediate ? 'User deletion triggered immediately' : `User deletion scheduled for ${deletionScheduledAt}`
		})
	};
});

