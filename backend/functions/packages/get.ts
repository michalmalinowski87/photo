import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

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

	const packageId = event?.pathParameters?.id;
	if (!packageId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing packageId' })
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
			TableName: packagesTable,
			Key: { packageId }
		}));

		if (!result.Item) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Package not found' })
			};
		}

		const pkg = result.Item as any;
		requireOwnerOr403(pkg.ownerId, ownerId);

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ package: pkg })
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to get package', message: error.message })
		};
	}
});

