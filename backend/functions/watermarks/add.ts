import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;

	if (!usersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing USERS_TABLE configuration' })
		};
	}

	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	const body = event?.body ? JSON.parse(event.body) : {};
	const { url, name } = body;

	if (!url) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing watermark URL' })
		};
	}

	try {
		// Get current watermarks
		const result = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId },
			ProjectionExpression: 'watermarks'
		}));

		const watermarks = result.Item?.watermarks || [];

		// Check if watermark already exists
		if (watermarks.some((wm: any) => wm.url === url)) {
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ message: 'Watermark already exists', watermark: watermarks.find((wm: any) => wm.url === url) })
			};
		}

		// Add new watermark
		const newWatermark = {
			url,
			name: name || `Znak wodny ${watermarks.length + 1}`,
			createdAt: new Date().toISOString()
		};

		const updatedWatermarks = [...watermarks, newWatermark];

		// Update users table
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId },
			UpdateExpression: 'SET watermarks = :watermarks, updatedAt = :updatedAt',
			ExpressionAttributeValues: {
				':watermarks': updatedWatermarks,
				':updatedAt': new Date().toISOString()
			}
		}));

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'Watermark added successfully', watermark: newWatermark })
		};
	} catch (error: any) {
		logger?.error('Add watermark failed', {
			error: { name: error.name, message: error.message },
			userId,
			url
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to add watermark', message: error.message })
		};
	}
});
