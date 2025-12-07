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
	const deleteBatchFnName = envProc?.env?.DELETE_BATCH_FN_NAME as string;

	if (!galleriesTable || !deleteBatchFnName) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const filename = event?.pathParameters?.filename;

	if (!galleryId || !filename) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId and filename are required' })
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

	// Construct S3 key for original image
	const originalKey = `galleries/${galleryId}/originals/${filename}`;

	// Invoke batch delete Lambda synchronously and wait for completion
	try {
		const invokeResponse = await lambda.send(new InvokeCommand({
			FunctionName: deleteBatchFnName,
			InvocationType: 'RequestResponse', // Synchronous invocation - wait for completion
			Payload: JSON.stringify({
				isProgrammaticCall: true,
				deletes: [{
					type: 'original',
					galleryId,
					filename,
					originalKey
				}]
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
				filename,
				lambdaResult
			});
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Failed to process deletion',
					message: lambdaResult.errorMessage || 'Lambda function error'
				})
			};
		}

		logger.info('Successfully completed batch delete Lambda for photo deletion', {
			galleryId,
			filename
		});

		// Get updated gallery state to return actual values
		const updatedGallery = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));

		const updatedOriginalsBytesUsed = Math.max(updatedGallery.Item?.originalsBytesUsed || 0, 0);
		const originalsLimitBytes = updatedGallery.Item?.originalsLimitBytes || 0;

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				message: 'Photo deleted successfully',
				galleryId,
				filename,
				originalsBytesUsed: updatedOriginalsBytesUsed,
				originalsLimitBytes,
				originalsUsedMB: (updatedOriginalsBytesUsed / (1024 * 1024)).toFixed(2),
				originalsLimitMB: (originalsLimitBytes / (1024 * 1024)).toFixed(2)
			})
		};
	} catch (err: any) {
		logger.error('Failed to invoke batch delete Lambda', {
			error: err.message,
			galleryId,
			filename
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to process deletion' })
		};
	}
});

