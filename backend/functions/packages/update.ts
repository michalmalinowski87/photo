import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

	const body = event?.body ? JSON.parse(event.body) : {};
	const {
		name,
		includedPhotos,
		pricePerExtraPhoto,
		price
	} = body;

	// Get existing package
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

	const existingPackage = getResult.Item as any;
	requireOwnerOr403(existingPackage.ownerId, ownerId);

	// Build update expression
	const updateExpressions: string[] = [];
	const expressionValues: Record<string, any> = {};
	const expressionNames: Record<string, string> = {};

	if (name !== undefined) {
		updateExpressions.push('#name = :name');
		expressionNames['#name'] = 'name';
		expressionValues[':name'] = name.trim();
	}

	if (includedPhotos !== undefined) {
		if (typeof includedPhotos !== 'number' || includedPhotos < 0) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'includedPhotos must be a non-negative number' })
			};
		}
		updateExpressions.push('includedPhotos = :includedPhotos');
		expressionValues[':includedPhotos'] = includedPhotos;
	}

	if (pricePerExtraPhoto !== undefined) {
		if (typeof pricePerExtraPhoto !== 'number' || pricePerExtraPhoto < 0) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'pricePerExtraPhoto must be a non-negative number' })
			};
		}
		updateExpressions.push('pricePerExtraPhoto = :pricePerExtraPhoto');
		expressionValues[':pricePerExtraPhoto'] = pricePerExtraPhoto;
	}

	if (price !== undefined) {
		if (typeof price !== 'number' || price < 0) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'price must be a non-negative number' })
			};
		}
		updateExpressions.push('price = :price');
		expressionValues[':price'] = price;
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
		const updateCommand: any = {
			TableName: packagesTable,
			Key: { packageId },
			UpdateExpression: `SET ${updateExpressions.join(', ')}`,
			ExpressionAttributeValues: expressionValues
		};

		// Only add ExpressionAttributeNames if we have any (i.e., if name is being updated)
		if (Object.keys(expressionNames).length > 0) {
			updateCommand.ExpressionAttributeNames = expressionNames;
		}

		await ddb.send(new UpdateCommand(updateCommand));

		// Get updated package
		const updatedResult = await ddb.send(new GetCommand({
			TableName: packagesTable,
			Key: { packageId }
		}));

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ package: updatedResult.Item })
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to update package', message: error.message })
		};
	}
});

