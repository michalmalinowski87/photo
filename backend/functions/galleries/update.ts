import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const table = envProc?.env?.GALLERIES_TABLE as string;
	if (!table) return { statusCode: 500, body: 'Missing table' };
	
	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: 'missing id' };
	
	const body = event?.body ? JSON.parse(event.body) : {};
	const requester = getUserIdFromEvent(event);
	
	const got = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId: id } }));
	const gallery = got.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	
	requireOwnerOr403(gallery.ownerId, requester);
	
	// Build update expression dynamically based on provided fields
	const updateExpressions: string[] = [];
	const expressionAttributeValues: Record<string, any> = {};
	const expressionAttributeNames: Record<string, string> = {};
	
	// Allow updating galleryName
	if (body.galleryName !== undefined && typeof body.galleryName === 'string') {
		updateExpressions.push('#name = :name');
		expressionAttributeNames['#name'] = 'galleryName';
		expressionAttributeValues[':name'] = body.galleryName.trim();
	}
	
	// Allow updating coverPhotoUrl
	if (body.coverPhotoUrl !== undefined && typeof body.coverPhotoUrl === 'string') {
		updateExpressions.push('#cover = :cover');
		expressionAttributeNames['#cover'] = 'coverPhotoUrl';
		expressionAttributeValues[':cover'] = body.coverPhotoUrl.trim();
	}
	
	// Always update updatedAt
	updateExpressions.push('updatedAt = :u');
	expressionAttributeValues[':u'] = new Date().toISOString();
	
	if (updateExpressions.length === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'No valid fields to update' })
		};
	}
	
	const updateExpression = `SET ${updateExpressions.join(', ')}`;
	
	const updateParams: any = {
		TableName: table,
		Key: { galleryId: id },
		UpdateExpression: updateExpression,
		ExpressionAttributeValues: expressionAttributeValues
	};
	
	if (Object.keys(expressionAttributeNames).length > 0) {
		updateParams.ExpressionAttributeNames = expressionAttributeNames;
	}
	
	await ddb.send(new UpdateCommand(updateParams));
	
	// Return updated gallery
	const updated = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId: id } }));
	
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(updated.Item)
	};
});

