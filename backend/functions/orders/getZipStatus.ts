import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { verifyGalleryAccess } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

/**
 * Get ZIP generation status and progress for selected originals
 * Returns status, progress information, and ready state
 */
export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	
	if (!ordersTable || !galleriesTable || !bucket) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	const orderId = event?.pathParameters?.orderId;
	
	if (!galleryId || !orderId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId or orderId' })
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

		// Verify access
		const access = await verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
			};
		}

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

		// Check if ZIP exists in S3
		const zipKey = `galleries/${galleryId}/zips/${orderId}.zip`;
		let zipExists = false;
		let zipSize: number | undefined;
		
		try {
			const headResponse = await s3.send(new HeadObjectCommand({
				Bucket: bucket,
				Key: zipKey
			}));
			zipExists = true;
			zipSize = headResponse.ContentLength;
		} catch (headErr: any) {
			if (headErr.name !== 'NotFound' && headErr.name !== 'NoSuchKey') {
				throw headErr;
			}
		}

		// Determine status
		let status: 'ready' | 'generating' | 'not_started' | 'error' = 'not_started';
		let generating = false;
		let errorInfo: any = undefined;

		// Check for error state (new error tracking system)
		if (order.zipErrorFinalized === true) {
			status = 'error';
			const zipErrorFinal = order.zipErrorFinal as any;
			const zipErrorAttempts = order.zipErrorAttempts as number | undefined;
			const zipErrorDetails = order.zipErrorDetails as any[] | undefined;
			
			if (zipErrorFinal) {
				errorInfo = {
					message: zipErrorFinal.error?.message || 'ZIP generation failed after multiple attempts',
					attempts: zipErrorAttempts || zipErrorFinal.attempts || 0,
					canRetry: access.isOwner, // Only owners can retry
					timestamp: zipErrorFinal.timestamp
				};
				
				// Include detailed error information for owners only
				if (access.isOwner && zipErrorDetails) {
					errorInfo.details = zipErrorDetails;
				}
			} else {
				// Fallback if zipErrorFinal is missing
				errorInfo = {
					message: 'ZIP generation failed',
					attempts: zipErrorAttempts || 0,
					canRetry: access.isOwner
				};
			}
		} else {
			// Check for error state in zipProgress (legacy error status, for backward compatibility)
			const zipProgress = order.zipProgress as any;
			if (zipProgress && typeof zipProgress === 'object' && !Array.isArray(zipProgress) && (zipProgress.status === 'error' || zipProgress.error)) {
				status = 'error';
				errorInfo = {
					message: zipProgress.error?.message || zipProgress.message || 'ZIP generation failed',
					attempts: 1,
					canRetry: access.isOwner
				};
			} else if (zipExists) {
				status = 'ready';
			} else if (order.zipGenerating) {
				status = 'generating';
				generating = true;
			}
		}

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				orderId,
				status,
				generating,
				ready: status === 'ready',
				zipExists,
				zipSize,
				...(errorInfo && { error: errorInfo })
			})
		};
	} catch (error: any) {
		const logger = (context as any).logger;
		logger?.error('Failed to get ZIP status', {
			galleryId: event?.pathParameters?.id,
			orderId: event?.pathParameters?.orderId,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to get ZIP status', message: error.message })
		};
	}
});

