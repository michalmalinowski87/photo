import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

	const body = event?.body ? JSON.parse(event.body) : {};
	const {
		email,
		firstName,
		lastName,
		phone,
		isCompany,
		companyName,
		nip
	} = body;

	// Get existing client
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

	const existingClient = getResult.Item as any;
	requireOwnerOr403(existingClient.ownerId, ownerId);

	// Build update expression
	const updateExpressions: string[] = [];
	const expressionValues: Record<string, any> = {};
	const expressionNames: Record<string, string> = {};

	if (email !== undefined) {
		updateExpressions.push('email = :email');
		expressionValues[':email'] = email.trim().toLowerCase();
	}

	if (firstName !== undefined) {
		updateExpressions.push('firstName = :firstName');
		expressionValues[':firstName'] = firstName?.trim() || '';
	}

	if (lastName !== undefined) {
		updateExpressions.push('lastName = :lastName');
		expressionValues[':lastName'] = lastName?.trim() || '';
	}

	if (phone !== undefined) {
		updateExpressions.push('phone = :phone');
		expressionValues[':phone'] = phone?.trim() || '';
	}

	if (isCompany !== undefined) {
		updateExpressions.push('isCompany = :isCompany');
		expressionValues[':isCompany'] = !!isCompany;
	}

	if (companyName !== undefined) {
		updateExpressions.push('companyName = :companyName');
		expressionValues[':companyName'] = companyName?.trim() || '';
	}

	if (nip !== undefined) {
		updateExpressions.push('nip = :nip');
		expressionValues[':nip'] = nip?.trim() || '';
	}

	if (updateExpressions.length === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'No fields to update' })
		};
	}

	updateExpressions.push('updatedAt = :updatedAt');
	expressionValues[':updatedAt'] = new Date().toISOString();

	try {
		await ddb.send(new UpdateCommand({
			TableName: clientsTable,
			Key: { clientId },
			UpdateExpression: `SET ${updateExpressions.join(', ')}`,
			ExpressionAttributeValues: expressionValues,
			ExpressionAttributeNames: expressionNames
		}));

		// Get updated client
		const updatedResult = await ddb.send(new GetCommand({
			TableName: clientsTable,
			Key: { clientId }
		}));

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ client: updatedResult.Item })
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to update client', message: error.message })
		};
	}
});

