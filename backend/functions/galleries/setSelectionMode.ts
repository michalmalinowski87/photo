import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const table = envProc?.env?.GALLERIES_TABLE as string;
	if (!table) return { statusCode: 500, body: 'Missing table' };

	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: 'missing id' };
	const body = event?.body ? JSON.parse(event.body) : {};
	if (typeof body.selectionEnabled !== 'boolean') {
		return { statusCode: 400, body: 'selectionEnabled boolean required' };
	}
	
	const requester = getUserIdFromEvent(event);
	const galleryGet = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId: id } }));
	const gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}
	requireOwnerOr403(gallery.ownerId, requester);
	
	const newSelectionEnabled = !!body.selectionEnabled;
	const currentSelectionEnabled = gallery.selectionEnabled !== false;
	
	// USER-CENTRIC FIX: Only allow gallery type upgrades (non-selection → selection)
	// Prevent downgrades (selection → non-selection) to maintain pricing consistency
	if (currentSelectionEnabled && !newSelectionEnabled) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Cannot downgrade gallery type',
				message: 'Cannot change gallery from selection-enabled to non-selection. Only upgrades (non-selection → selection) are allowed to maintain pricing consistency.'
			})
		};
	}
	
	// If no change, return success
	if (currentSelectionEnabled === newSelectionEnabled) {
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ galleryId: id, selectionEnabled: newSelectionEnabled, selectionStatus: newSelectionEnabled ? 'NOT_STARTED' : 'DISABLED' })
		};
	}
	
	const selectionStatus = newSelectionEnabled ? 'NOT_STARTED' : 'DISABLED';

	await ddb.send(new UpdateCommand({
		TableName: table,
		Key: { galleryId: id },
		UpdateExpression: 'SET selectionEnabled = :e, selectionStatus = :s, updatedAt = :u',
		ExpressionAttributeValues: {
			':e': newSelectionEnabled,
			':s': selectionStatus,
			':u': new Date().toISOString()
		},
	}));
	
	logger?.info('Gallery type upgraded (non-selection → selection)', { galleryId: id, previousType: currentSelectionEnabled, newType: newSelectionEnabled });

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ galleryId: id, selectionEnabled: newSelectionEnabled, selectionStatus })
	};
});

