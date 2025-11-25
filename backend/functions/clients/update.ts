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
		isVatRegistered,
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

	// Determine final isCompany value (use provided value or existing value)
	const finalIsCompany = isCompany !== undefined ? !!isCompany : existingClient.isCompany;

	// Build update expression
	const updateExpressions: string[] = [];
	const expressionValues: Record<string, any> = {};
	const expressionNames: Record<string, string> = {};

	if (email !== undefined) {
		updateExpressions.push('email = :email');
		expressionValues[':email'] = email.trim().toLowerCase();
	}

	if (phone !== undefined) {
		updateExpressions.push('phone = :phone');
		expressionValues[':phone'] = phone?.trim() || '';
	}

	if (isCompany !== undefined) {
		updateExpressions.push('isCompany = :isCompany');
		expressionValues[':isCompany'] = !!isCompany;
	}

	if (isVatRegistered !== undefined) {
		updateExpressions.push('isVatRegistered = :isVatRegistered');
		// Only set VAT registration if it's a company, otherwise reset to false
		expressionValues[':isVatRegistered'] = finalIsCompany ? !!isVatRegistered : false;
	} else if (finalIsCompany === false) {
		// If switching to non-company, reset VAT registration
		updateExpressions.push('isVatRegistered = :isVatRegistered');
		expressionValues[':isVatRegistered'] = false;
	}

	// When isCompany is true: use companyName and nip, reset firstName and lastName to ""
	// When isCompany is false: use firstName and lastName, reset companyName and nip to ""
	// Always update these fields to ensure consistency
	if (finalIsCompany) {
		// Business: reset firstName and lastName, use companyName and nip
		updateExpressions.push('firstName = :firstName');
		updateExpressions.push('lastName = :lastName');
		expressionValues[':firstName'] = '';
		expressionValues[':lastName'] = '';
		
		// Update companyName and nip (use provided values or existing)
		updateExpressions.push('companyName = :companyName');
		updateExpressions.push('nip = :nip');
		expressionValues[':companyName'] = companyName !== undefined ? (companyName?.trim() || '') : (existingClient.companyName || '');
		expressionValues[':nip'] = nip !== undefined ? (nip?.trim() || '') : (existingClient.nip || '');
	} else {
		// Non-business: use firstName and lastName, reset companyName and nip
		updateExpressions.push('firstName = :firstName');
		updateExpressions.push('lastName = :lastName');
		expressionValues[':firstName'] = firstName !== undefined ? (firstName?.trim() || '') : (existingClient.firstName || '');
		expressionValues[':lastName'] = lastName !== undefined ? (lastName?.trim() || '') : (existingClient.lastName || '');
		
		// Always reset company fields for non-business
		updateExpressions.push('companyName = :companyName');
		updateExpressions.push('nip = :nip');
		expressionValues[':companyName'] = '';
		expressionValues[':nip'] = '';
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
		const updateParams: any = {
			TableName: clientsTable,
			Key: { clientId },
			UpdateExpression: `SET ${updateExpressions.join(', ')}`,
			ExpressionAttributeValues: expressionValues
		};

		// Only include ExpressionAttributeNames if it has values
		if (Object.keys(expressionNames).length > 0) {
			updateParams.ExpressionAttributeNames = expressionNames;
		}

		await ddb.send(new UpdateCommand(updateParams));

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

