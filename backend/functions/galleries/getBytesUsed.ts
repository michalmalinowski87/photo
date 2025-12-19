import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbGet } from '../../lib/src/ddb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { recalculateStorageInternal } from './recalculateBytesUsed';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'missing id' }) };
	
	const envProc = (globalThis as any).process;
	const tableName = envProc && envProc.env ? (envProc.env.GALLERIES_TABLE as string) : '';
	
	// Check if force recalculation is requested (query parameter)
	const forceRecalc = event?.queryStringParameters?.force === 'true';
	
	const gallery = await ddbGet<any>(tableName, { galleryId: id });
	if (!gallery) {
		return { statusCode: 404, body: JSON.stringify({ error: 'not found' }) };
	}
	const requesterId = getUserIdFromEvent(event);
	requireOwnerOr403(gallery.ownerId, requesterId);
	
	// If force recalculation is requested, recalculate from DynamoDB
	if (forceRecalc) {
		logger?.info('Force recalculation requested for getBytesUsed', { galleryId: id });
		const imagesTable = envProc?.env?.IMAGES_TABLE as string;
		if (imagesTable) {
			const recalcResult = await recalculateStorageInternal(id, tableName, imagesTable, gallery, logger, true);
		
		if (recalcResult.statusCode === 200) {
			try {
				const body = JSON.parse(recalcResult.body);
				return {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						originalsBytesUsed: body.originalsBytesUsed ?? 0,
						finalsBytesUsed: body.finalsBytesUsed ?? 0,
					})
				};
			} catch {
				// Fall through to cached values if parsing fails
			}
		}
			// Fall through to cached values if recalculation fails
		}
	}
	
	// Return cached bytes used fields - lightweight endpoint
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			originalsBytesUsed: gallery.originalsBytesUsed ?? 0,
			finalsBytesUsed: gallery.finalsBytesUsed ?? 0,
		})
	};
});

