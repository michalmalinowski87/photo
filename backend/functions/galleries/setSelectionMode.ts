import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const table = envProc?.env?.GALLERIES_TABLE as string;
	if (!table) return { statusCode: 500, body: 'Missing table' };

	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: 'missing id' };
	const body = event?.body ? JSON.parse(event.body) : {};
	if (typeof body.selectionEnabled !== 'boolean') {
		return { statusCode: 400, body: 'selectionEnabled boolean required' };
	}
	const selectionEnabled = !!body.selectionEnabled;
	const selectionStatus = selectionEnabled ? 'NOT_STARTED' : 'DISABLED';

	await ddb.send(new UpdateCommand({
		TableName: table,
		Key: { galleryId: id },
		UpdateExpression: 'SET selectionEnabled = :e, selectionStatus = :s, updatedAt = :u',
		ExpressionAttributeValues: {
			':e': selectionEnabled,
			':s': selectionStatus,
			':u': new Date().toISOString()
		},
	}));

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ galleryId: id, selectionEnabled, selectionStatus })
	};
});

