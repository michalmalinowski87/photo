import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { LambdaEvent, ClientItem } from '../../lib/src/lambda-types';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: LambdaEvent) => {
	const envProc = (globalThis as any).process;
	const clientsTable = envProc?.env?.CLIENTS_TABLE as string;
	
	if (!clientsTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing CLIENTS_TABLE environment variable' })
		};
	}

	const clientId = event?.pathParameters?.id;
	if (!clientId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing clientId' })
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
		const result = await ddb.send(new GetCommand({
			TableName: clientsTable,
			Key: { clientId }
		}));

		if (!result.Item) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Client not found' })
			};
		}

		const client = result.Item as ClientItem;
		requireOwnerOr403(client.ownerId, ownerId);

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ client })
		};
	} catch (error: unknown) {
		return createLambdaErrorResponse(error, 'Failed to get client', 500);
	}
});

