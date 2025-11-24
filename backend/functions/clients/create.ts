import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

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
		isCompany = false,
		companyName,
		nip
	} = body;

	if (!email || !email.trim()) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Email is required' })
		};
	}

	if (!isCompany && (!firstName || !lastName)) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'First name and last name are required for individuals' })
		};
	}

	if (isCompany && (!companyName || !nip)) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Company name and NIP are required for companies' })
		};
	}

	const now = new Date().toISOString();
	const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	const client = {
		clientId,
		ownerId,
		email: email.trim().toLowerCase(),
		firstName: firstName?.trim() || '',
		lastName: lastName?.trim() || '',
		phone: phone?.trim() || '',
		isCompany: !!isCompany,
		companyName: isCompany ? companyName.trim() : '',
		nip: isCompany ? nip.trim() : '',
		createdAt: now,
		updatedAt: now
	};

	try {
		await ddb.send(new PutCommand({
			TableName: clientsTable,
			Item: client
		}));

		return {
			statusCode: 201,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ client })
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to create client', message: error.message })
		};
	}
});

