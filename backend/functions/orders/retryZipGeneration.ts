import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { requireOwnerOr403, getUserIdFromEvent } from '../../lib/src/auth';
import { createHash } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
	marshallOptions: {
		removeUndefinedValues: true // Remove undefined values to avoid DynamoDB errors
	}
});
const lambda = new LambdaClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	
	if (!ordersTable || !galleriesTable || !zipFnName) {
		const missing: string[] = [];
		if (!ordersTable) missing.push('ORDERS_TABLE');
		if (!galleriesTable) missing.push('GALLERIES_TABLE');
		if (!zipFnName) missing.push('DOWNLOADS_ZIP_FN_NAME');
		
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Missing required environment variables',
				missing: missing
			})
		};
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	const type = event?.queryStringParameters?.type || 'original'; // 'original' or 'final'
	const isFinal = type === 'final';
	
	if (!galleryId || !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or orderId' })
		};
	}

	try {
		// Verify gallery exists and get owner
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

		// Verify owner access only
		const requesterId = getUserIdFromEvent(event);
		requireOwnerOr403(gallery.ownerId, requesterId);

		// Get order
		const orderGet = await ddb.send(new GetCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId }
		}));
		const order = orderGet.Item as any;
		if (!order) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Order not found' })
			};
		}

		// Check if there's an error to retry
		const errorFinalized = isFinal ? order.finalZipErrorFinalized : order.zipErrorFinalized;
		if (!errorFinalized) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'No error to retry', 
					message: 'ZIP generation has not failed. There is nothing to retry.' 
				})
			};
		}

		// Clear error fields and reset generating flag
		const errorFields = isFinal
			? 'finalZipErrorAttempts, finalZipErrorDetails, finalZipErrorFinal, finalZipErrorFinalized'
			: 'zipErrorAttempts, zipErrorDetails, zipErrorFinal, zipErrorFinalized';
		
		const generatingField = isFinal ? 'finalZipGenerating' : 'zipGenerating';
		const generatingSinceField = isFinal ? 'finalZipGeneratingSince' : 'zipGeneratingSince';

		await ddb.send(new UpdateCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId },
			UpdateExpression: `REMOVE ${errorFields} SET ${generatingField} = :g, ${generatingSinceField} = :ts`,
			ExpressionAttributeValues: {
				':g': true,
				':ts': Date.now()
			}
		}));

		logger?.info('Cleared error fields and reset generating flag for retry', {
			galleryId,
			orderId,
			isFinal,
			requesterId
		});

		// Prepare payload for ZIP generation
		let payload: any;
		
		if (isFinal) {
			// For final ZIPs, we need to compute the hash from DynamoDB
			const imagesTable = envProc?.env?.IMAGES_TABLE as string;
			if (!imagesTable) {
				return {
					statusCode: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Missing required environment variable',
						missing: ['IMAGES_TABLE']
					})
				};
			}

			let allFinalImageRecords: any[] = [];
			let lastEvaluatedKey: any = undefined;

			do {
				const queryResponse = await ddb.send(new QueryCommand({
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
					Limit: 1000,
					ExclusiveStartKey: lastEvaluatedKey
				}));
				
				allFinalImageRecords.push(...(queryResponse.Items || []));
				lastEvaluatedKey = queryResponse.LastEvaluatedKey;
			} while (lastEvaluatedKey);

			if (allFinalImageRecords.length === 0) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'No final images found for order' })
				};
			}

			const finalFilesWithMetadata = allFinalImageRecords
				.map(record => ({
					filename: record.filename,
					etag: record.etag || '',
					size: record.size || 0,
					lastModified: record.lastModified || 0
				}))
				.sort((a, b) => a.filename.localeCompare(b.filename));
			
			const finalFilesHash = createHash('sha256')
				.update(JSON.stringify(finalFilesWithMetadata))
				.digest('hex')
				.substring(0, 16);

			payload = {
				galleryId,
				orderId,
				type: 'final',
				finalFilesHash
			};
		} else {
			// For original ZIPs, use selectedKeys from order
			const selectedKeys = order.selectedKeys as string[] | undefined;
			if (!selectedKeys || selectedKeys.length === 0) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'No selected keys found for order' })
				};
			}

			// Compute hash for selected keys
			const sortedKeys = [...selectedKeys].sort();
			const selectedKeysHash = createHash('sha256')
				.update(JSON.stringify(sortedKeys))
				.digest('hex')
				.substring(0, 16);

			payload = {
				galleryId,
				orderId,
				keys: selectedKeys,
				selectedKeysHash
			};
		}

		// Invoke ZIP generation Lambda asynchronously
		await lambda.send(new InvokeCommand({
			FunctionName: zipFnName,
			Payload: Buffer.from(JSON.stringify(payload)),
			InvocationType: 'Event' // Async invocation
		}));

		logger?.info('Triggered ZIP generation Lambda for retry', {
			galleryId,
			orderId,
			isFinal,
			zipFnName,
			requesterId
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				message: 'ZIP generation retry initiated',
				galleryId,
				orderId,
				type,
				isFinal
			})
		};
	} catch (error: any) {
		logger?.error('Failed to retry ZIP generation', {
			galleryId: event?.pathParameters?.id,
			orderId: event?.pathParameters?.orderId,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to retry ZIP generation', message: error.message })
		};
	}
});
