import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
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
		// Get package to verify ownership
		const getResult = await ddb.send(new GetCommand({
			TableName: packagesTable,
			Key: { packageId }
		}));

		if (!getResult.Item) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Package not found' })
			};
		}

		const pkg = getResult.Item as any;
		requireOwnerOr403(pkg.ownerId, ownerId);

		// Delete package
		await ddb.send(new DeleteCommand({
			TableName: packagesTable,
			Key: { packageId }
		}));

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'Package deleted successfully', packageId })
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to delete package', message: error.message })
		};
	}
});

