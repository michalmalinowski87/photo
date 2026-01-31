import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const KEYS_PAGE_LIMIT = 5000;

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;

	if (!galleriesTable || !imagesTable || !ordersTable) {
		return createLambdaErrorResponse(
			new Error('Missing required environment variables'),
			'Missing required environment variables',
			500
		);
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) {
		return createLambdaErrorResponse(
			new Error('Missing galleryId or orderId'),
			'Missing galleryId or orderId',
			400
		);
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
			logger.warn('Invalid cursor format', { galleryId, orderId });
		}
	}

	try {
		const [galleryResult, orderResult] = await Promise.all([
			ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			})),
			ddb.send(new GetCommand({
				TableName: ordersTable,
				Key: { galleryId, orderId }
			}))
		]);

		const gallery = galleryResult.Item as any;
		if (!gallery) {
			return createLambdaErrorResponse(
				new Error('Gallery not found'),
				'Gallery not found',
				404
			);
		}

		const order = orderResult.Item as any;
		if (!order) {
			return createLambdaErrorResponse(
				new Error('Order not found'),
				'Order not found',
				404
			);
		}

		const access = await verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return createLambdaErrorResponse(
				new Error('Unauthorized'),
				'Unauthorized. Please log in.',
				401
			);
		}

		if (access.isClient) {
			let isPaid = false;
			try {
				const paidTransaction = await getPaidTransactionForGallery(galleryId);
				isPaid = !!paidTransaction;
			} catch {
				isPaid = gallery.state === 'PAID_ACTIVE';
			}
			if (!isPaid) {
				return createLambdaErrorResponse(
					new Error('Gallery not published'),
					'Gallery not published',
					403
				);
			}
		}

		const queryParams: any = {
			TableName: imagesTable,
			IndexName: 'galleryId-orderId-index',
			KeyConditionExpression: 'galleryId = :g AND orderId = :orderId',
			FilterExpression: '#type = :type',
			ExpressionAttributeNames: { '#type': 'type' },
			ExpressionAttributeValues: {
				':g': galleryId,
				':orderId': orderId,
				':type': 'final'
			},
			ProjectionExpression: 'filename',
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
				orderId,
				keys,
				hasMore,
				nextCursor
			})
		};
	} catch (error: any) {
		logger.error('List final image keys failed', {
			error: { name: error.name, message: error.message },
			galleryId,
			orderId
		});
		return createLambdaErrorResponse(error, 'Failed to list final image keys', 500);
	}
});
