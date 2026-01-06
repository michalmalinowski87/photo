import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Dev endpoint to set user's lastLoginAt (simulate inactivity)
 * Only available in development/staging environments
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const stage = envProc?.env?.STAGE as string;

	// Only allow in dev/staging
	if (stage === 'prod') {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'This endpoint is not available in production' })
		};
	}

	if (!usersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing USERS_TABLE configuration' })
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
	const lastLoginAt = body.lastLoginAt; // ISO string or number of months ago

	if (lastLoginAt === undefined) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'lastLoginAt is required (ISO string or monthsAgo number)' })
		};
	}

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

	// Calculate lastLoginAt
	let calculatedLastLoginAt: string;
	if (typeof lastLoginAt === 'number') {
		// If number, treat as months ago
		const monthsAgo = lastLoginAt;
		const date = new Date();
		date.setMonth(date.getMonth() - monthsAgo);
		calculatedLastLoginAt = date.toISOString();
	} else {
		// If string, validate it's a valid ISO date
		const date = new Date(lastLoginAt);
		if (isNaN(date.getTime())) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Invalid lastLoginAt date format. Use ISO 8601 format or number of months ago.' })
			};
		}
		calculatedLastLoginAt = date.toISOString();
	}

	// Update user
	await ddb.send(new PutCommand({
		TableName: usersTable,
		Item: {
			...user,
			lastLoginAt: calculatedLastLoginAt,
			updatedAt: new Date().toISOString()
		}
	}));

	logger.info('Set user lastLoginAt', { userId, lastLoginAt: calculatedLastLoginAt });

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			userId,
			lastLoginAt: calculatedLastLoginAt,
			message: 'User lastLoginAt updated'
		})
	};
});


