import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { LambdaEvent, LambdaContext, GalleryItem, OrderItem } from '../../lib/src/lambda-types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: LambdaEvent, context: LambdaContext) => {
	const logger = context?.logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	if (!galleriesTable || !ordersTable) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	if (!galleryId || !orderId) return { statusCode: 400, body: 'missing params' };
	const requester = getUserIdFromEvent(event);

	if (!requester) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as GalleryItem | undefined;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	requireOwnerOr403(gallery.ownerId, requester);

	const o = await ddb.send(new GetCommand({ TableName: ordersTable, Key: { galleryId, orderId } }));
	if (!o.Item) return { statusCode: 404, body: 'order not found' };

	const order = o.Item as OrderItem;
	
	if (logger) {
		logger.info('Order fetched', {
			orderId,
			galleryId,
			hasSelectedKeys: !!order.selectedKeys,
			selectedKeysType: typeof order.selectedKeys,
			selectedKeysIsArray: Array.isArray(order.selectedKeys),
			selectedKeysLength: Array.isArray(order.selectedKeys) ? order.selectedKeys.length : 'N/A',
			orderKeys: Object.keys(order)
		});
	}
	
	// DynamoDB might return List type which needs to be explicitly included
	const orderResponse = {
		...order,
		selectedKeys: order.selectedKeys || []
	};

	return { 
		statusCode: 200, 
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(orderResponse) 
	};
});


