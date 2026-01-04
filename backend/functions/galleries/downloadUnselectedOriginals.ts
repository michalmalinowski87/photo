import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { verifyGalleryAccess } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const lambda = new LambdaClient({});

/**
 * Generate and download ZIP of unselected originals from gallery
 * On-demand only - generates ZIP with short TTL (2 hours)
 * 
 * This function:
 * 1. Lists all originals in gallery
 * 2. Filters out selected keys from all orders
 * 3. Generates ZIP on-demand
 * 4. Returns presigned URL for download
 * 5. Warns if gallery has >20 images
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	
	if (!bucket || !galleriesTable || !imagesTable || !ordersTable) {
		logger.error('Missing required environment variables');
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

	try {
		// Verify gallery exists
		const galleryGet = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));
		const gallery = galleryGet.Item as any;
		if (!gallery) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Gallery not found' })
			};
		}

		// Verify access - supports both owner (Cognito) and client (JWT) tokens
		const access = await verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
			};
		}

		// Query all orders for this gallery to get all selected keys
		const ordersQuery = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: { ':g': galleryId }
		}));
		const orders = ordersQuery.Items || [];

		// Collect all selected keys from all orders
		const allSelectedKeys = new Set<string>();
		orders.forEach((order: any) => {
			if (order.selectedKeys && Array.isArray(order.selectedKeys)) {
				order.selectedKeys.forEach((key: string) => {
					allSelectedKeys.add(key);
				});
			}
		});

		// Query DynamoDB for all original images in gallery
		let allImageRecords: any[] = [];
		let lastEvaluatedKey: any = undefined;
		
		do {
			const queryParams: any = {
				TableName: imagesTable,
				IndexName: 'galleryId-lastModified-index',
				KeyConditionExpression: 'galleryId = :g',
				FilterExpression: '#type = :type',
				ExpressionAttributeNames: {
					'#type': 'type'
				},
				ExpressionAttributeValues: {
					':g': galleryId,
					':type': 'original'
				},
				Limit: 1000
			};

			if (lastEvaluatedKey) {
				queryParams.ExclusiveStartKey = lastEvaluatedKey;
			}
			
			const queryResponse = await ddb.send(new QueryCommand(queryParams));
			allImageRecords.push(...(queryResponse.Items || []));
			lastEvaluatedKey = queryResponse.LastEvaluatedKey;
		} while (lastEvaluatedKey);

		// Extract filenames and filter out selected keys
		const unselectedKeys = allImageRecords
			.map(record => record.filename)
			.filter(filename => filename && !allSelectedKeys.has(filename));

		if (unselectedKeys.length === 0) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'No unselected originals found' })
			};
		}

		// Warn if >20 images
		const warning = unselectedKeys.length > 20 
			? `This gallery has ${unselectedKeys.length} unselected images. ZIP generation may take some time.`
			: undefined;

		// Generate ZIP on-demand
		if (!zipFnName) {
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'ZIP generation service not configured' })
			};
		}

		// Use a special orderId for unselected originals ZIPs (on-demand, short TTL)
		const unselectedOrderId = `unselected-${Date.now()}`;
		const zipKey = `galleries/${galleryId}/zips/${unselectedOrderId}.zip`;

		// Invoke ZIP generation Lambda asynchronously
		const payload = Buffer.from(JSON.stringify({ 
			galleryId, 
			keys: unselectedKeys, 
			orderId: unselectedOrderId,
			type: 'unselected' // Mark as unselected for special handling
		}));
		
		await lambda.send(new InvokeCommand({ 
			FunctionName: zipFnName, 
			Payload: payload, 
			InvocationType: 'Event' // Async invocation
		}));
		
		logger.info('Unselected originals ZIP generation Lambda invoked', { 
			galleryId, 
			orderId: unselectedOrderId,
			unselectedCount: unselectedKeys.length,
			zipFnName 
		});

		// Return response with warning and status
		return {
			statusCode: 202,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				status: 'generating',
				message: 'ZIP is being generated. Please check again in a moment.',
				galleryId,
				orderId: unselectedOrderId,
				unselectedCount: unselectedKeys.length,
				warning,
				zipKey
			})
		};
	} catch (error: any) {
		logger.error('Failed to generate unselected originals ZIP', {
			error: error.message,
			galleryId,
			stack: error.stack
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to generate ZIP', message: error.message })
		};
	}
});

