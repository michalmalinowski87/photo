import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
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
		// Get client to verify ownership
		const getResult = await ddb.send(new GetCommand({
			TableName: clientsTable,
			Key: { clientId }
		}));

		if (!getResult.Item) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Client not found' })
			};
		}

		const client = getResult.Item as any;
		requireOwnerOr403(client.ownerId, ownerId);

		// Delete client
		await ddb.send(new DeleteCommand({
			TableName: clientsTable,
			Key: { clientId }
		}));

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'Client deleted successfully', clientId })
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to delete client', message: error.message })
		};
	}
});

