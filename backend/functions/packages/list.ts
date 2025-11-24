import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const packagesTable = envProc?.env?.PACKAGES_TABLE as string;
	
	if (!packagesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing PACKAGES_TABLE environment variable' })
		};
	}

	const ownerId = getUserIdFromEvent(event);
	if (!ownerId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	try {
		const result = await ddb.send(new QueryCommand({
			TableName: packagesTable,
			IndexName: 'ownerId-index',
			KeyConditionExpression: 'ownerId = :o',
			ExpressionAttributeValues: {
				':o': ownerId
			},
			ScanIndexForward: false // Newest first
		}));

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				items: result.Items || [],
				count: result.Items?.length || 0
			})
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list packages', message: error.message })
		};
	}
});

