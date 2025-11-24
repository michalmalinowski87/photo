import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
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

	const body = event?.body ? JSON.parse(event.body) : {};
	const {
		name,
		includedPhotos,
		pricePerExtraPhoto,
		price
	} = body;

	if (!name || !name.trim()) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Package name is required' })
		};
	}

	if (typeof includedPhotos !== 'number' || includedPhotos < 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'includedPhotos must be a non-negative number' })
		};
	}

	if (typeof pricePerExtraPhoto !== 'number' || pricePerExtraPhoto < 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'pricePerExtraPhoto must be a non-negative number' })
		};
	}

	if (typeof price !== 'number' || price < 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'price must be a non-negative number' })
		};
	}

	const now = new Date().toISOString();
	const packageId = `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	const pkg = {
		packageId,
		ownerId,
		name: name.trim(),
		includedPhotos,
		pricePerExtraPhoto,
		price,
		createdAt: now,
		updatedAt: now
	};

	try {
		await ddb.send(new PutCommand({
			TableName: packagesTable,
			Item: pkg
		}));

		return {
			statusCode: 201,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ package: pkg })
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to create package', message: error.message })
		};
	}
});

