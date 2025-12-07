import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { verifyGalleryAccess } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const deleteBatchFnName = envProc?.env?.DELETE_BATCH_FN_NAME as string;

	if (!galleriesTable || !deleteBatchFnName) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	// Extract parameters from event FIRST (before using them)
	const galleryId = event?.pathParameters?.id;
	const body = event?.body ? JSON.parse(event.body) : {};
	const filenames = body.filenames || [];
	const orderId = body.orderId; // Optional: required for final images
	const type = body.type || 'original'; // 'original' or 'final', defaults to 'original'

	if (!galleryId || !Array.isArray(filenames) || filenames.length === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId and filenames array are required' })
		};
	}

	// Validate: final images require orderId
	if (type === 'final' && !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'orderId is required for final image deletions' })
		};
	}

	// For final images, also verify order exists and is not DELIVERED
	if (type === 'final' && ordersTable && orderId) {
		const orderGet = await ddb.send(new GetCommand({
			TableName: ordersTable,
			Key: { galleryId, orderId }
		}));

		if (!orderGet.Item) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Order not found' })
			};
		}

		const order = orderGet.Item as any;
		// Prevent deletion of final images when order is DELIVERED
		if (order.deliveryStatus === 'DELIVERED') {
			return {
				statusCode: 403,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Cannot delete final images',
					message: 'Cannot delete final images for delivered orders. The order has already been delivered to the client.'
				})
			};
		}
	}

	if (!galleryId || !Array.isArray(filenames) || filenames.length === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId and filenames array are required' })
		};
	}

	// Get gallery to verify access
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

	// Verify access: Only photographer (owner) can delete photos
	const access = verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner) {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Forbidden: Only gallery owner can delete photos' })
		};
	}

	// Build delete operations array
	const deletes = filenames.map((filename: string) => {
		if (type === 'final') {
			return {
				type: 'final' as const,
				galleryId,
				orderId: orderId!,
				filename,
				originalKey: `galleries/${galleryId}/final/${orderId}/${filename}`
			};
		} else {
			return {
				type: 'original' as const,
				galleryId,
				filename,
				originalKey: `galleries/${galleryId}/originals/${filename}`
			};
		}
	});

	// Invoke batch delete Lambda synchronously and wait for completion
	try {
		logger.info('Invoking batch delete Lambda (synchronous)', {
			galleryId,
			type,
			orderId,
			count: filenames.length,
			deleteBatchFnName
		});

		const invokeResponse = await lambda.send(new InvokeCommand({
			FunctionName: deleteBatchFnName,
			InvocationType: 'RequestResponse', // Synchronous invocation - wait for completion
			Payload: JSON.stringify({
				isProgrammaticCall: true,
				deletes
			})
		}));

		// Parse response from Lambda
		let lambdaResult: any = {};
		if (invokeResponse.Payload) {
			try {
				const payloadString = Buffer.from(invokeResponse.Payload).toString('utf-8');
				lambdaResult = JSON.parse(payloadString);
			} catch (parseErr: any) {
				logger.warn('Failed to parse Lambda response', {
					error: parseErr.message,
					galleryId
				});
			}
		}

		// Check if Lambda function errored
		if (invokeResponse.FunctionError) {
			logger.error('Batch delete Lambda function error', {
				error: invokeResponse.FunctionError,
				galleryId,
				type,
				orderId,
				lambdaResult
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Failed to process deletions',
					message: lambdaResult.errorMessage || 'Lambda function error'
				})
			};
		}

		logger.info('Successfully completed batch delete Lambda', {
			galleryId,
			type,
			orderId,
			count: filenames.length,
			lambdaResult
		});

		// Get updated gallery state to return actual values
		const updatedGallery = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));

		if (type === 'final') {
			const updatedFinalsBytesUsed = Math.max(updatedGallery.Item?.finalsBytesUsed || 0, 0);
			const finalsLimitBytes = updatedGallery.Item?.finalsLimitBytes || 0;

			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					message: 'Final images deleted successfully',
					galleryId,
					orderId,
					count: filenames.length,
					finalsBytesUsed: updatedFinalsBytesUsed,
					finalsLimitBytes,
					finalsUsedMB: (updatedFinalsBytesUsed / (1024 * 1024)).toFixed(2),
					finalsLimitMB: (finalsLimitBytes / (1024 * 1024)).toFixed(2)
				})
			};
		} else {
			const updatedOriginalsBytesUsed = Math.max(updatedGallery.Item?.originalsBytesUsed || 0, 0);
			const originalsLimitBytes = updatedGallery.Item?.originalsLimitBytes || 0;

			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					message: 'Photos deleted successfully',
					galleryId,
					count: filenames.length,
					originalsBytesUsed: updatedOriginalsBytesUsed,
					originalsLimitBytes,
					originalsUsedMB: (updatedOriginalsBytesUsed / (1024 * 1024)).toFixed(2),
					originalsLimitMB: (originalsLimitBytes / (1024 * 1024)).toFixed(2)
				})
			};
		}
	} catch (err: any) {
		logger.error('Failed to invoke batch delete Lambda', {
			error: err.message,
			galleryId,
			type,
			orderId,
			count: filenames.length
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to process deletions' })
		};
	}
});

