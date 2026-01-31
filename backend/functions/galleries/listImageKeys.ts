import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const KEYS_PAGE_LIMIT = 5000;

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;

	if (!galleriesTable || !imagesTable) {
		logger.error('Missing required environment variables', {
			hasGalleriesTable: !!galleriesTable,
			hasImagesTable: !!imagesTable
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId' })
		};
	}

	const limitParam = event?.queryStringParameters?.limit;
	const limit = limitParam
		? Math.min(Math.max(parseInt(limitParam, 10) || KEYS_PAGE_LIMIT, 1), KEYS_PAGE_LIMIT)
		: KEYS_PAGE_LIMIT;
	const cursorParam = event?.queryStringParameters?.cursor;
	let exclusiveStartKey: Record<string, unknown> | undefined;
	if (cursorParam) {
		try {
			exclusiveStartKey = JSON.parse(
				Buffer.from(cursorParam, 'base64url').toString('utf8')
			) as Record<string, unknown>;
		} catch {
			logger.warn('Invalid cursor format', { galleryId });
		}
	}

	let gallery: any;
	try {
		const galleryGet = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));
		gallery = galleryGet.Item;
		if (!gallery) {
			logger.warn('Gallery not found', { galleryId });
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery not found' })
			};
		}
	} catch (err: any) {
		logger.error('Failed to fetch gallery', {
			error: { name: err.name, message: err.message },
			galleryId
		});
		return createLambdaErrorResponse(err, 'Failed to fetch gallery', 500);
	}

	const access = await verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner && !access.isClient) {
		logger.warn('Invalid or missing authentication', { galleryId });
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	try {
		const queryParams: any = {
			TableName: imagesTable,
			IndexName: 'galleryId-lastModified-index',
			KeyConditionExpression: 'galleryId = :g',
			FilterExpression: '#type = :type',
			ExpressionAttributeNames: { '#type': 'type' },
			ExpressionAttributeValues: { ':g': galleryId, ':type': 'original' },
			ProjectionExpression: 'filename',
			ScanIndexForward: false,
			Limit: limit
		};
		if (exclusiveStartKey) {
			queryParams.ExclusiveStartKey = exclusiveStartKey;
		}

		const queryResponse = await ddb.send(new QueryCommand(queryParams));
		const items = queryResponse.Items || [];
		const keys = items.map((r: any) => r.filename).filter(Boolean);
		const hasMore = !!queryResponse.LastEvaluatedKey;
		const nextCursor = hasMore
			? Buffer.from(
					JSON.stringify(queryResponse.LastEvaluatedKey),
					'utf8'
				).toString('base64url')
			: null;

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				keys,
				hasMore,
				nextCursor
			})
		};
	} catch (error: any) {
		logger.error('List image keys failed', {
			error: { name: error.name, message: error.message },
			galleryId
		});
		return createLambdaErrorResponse(error, 'Failed to list image keys', 500);
	}
});
