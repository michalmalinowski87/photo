import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { verifyGalleryAccess } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

/**
 * Get final ZIP generation status and progress
 * Returns status, progress information, and ready state
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
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
		const filename = `gallery-${galleryId}-order-${orderId}-final.zip`;
		const zipKey = `galleries/${galleryId}/orders/${orderId}/final-zip/${filename}`;
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
		const finalZipErrorAttempts = order.finalZipErrorAttempts as number | undefined;
		const finalZipErrorDetails = order.finalZipErrorDetails as any[] | undefined;
		const finalZipErrorFinal = order.finalZipErrorFinal as any;
		const finalZipErrorFinalized = order.finalZipErrorFinalized;

		// Check for error state - be very permissive: check finalized flag, attempts, error details, or error final object
		const hasErrorAttempts = typeof finalZipErrorAttempts === 'number' && finalZipErrorAttempts > 0;
		const hasErrorDetails = Array.isArray(finalZipErrorDetails) && finalZipErrorDetails.length > 0;
		const hasErrorFinal = finalZipErrorFinal && typeof finalZipErrorFinal === 'object';
		const isErrorFinalized = finalZipErrorFinalized === true || finalZipErrorFinalized === 'true';

		if (isErrorFinalized || hasErrorAttempts || hasErrorDetails || hasErrorFinal) {
			status = 'error';
			
			// Ensure attempts is always a number, defaulting to 0 if missing
			const attempts = typeof finalZipErrorAttempts === 'number' 
				? finalZipErrorAttempts 
				: (finalZipErrorFinal?.attempts && typeof finalZipErrorFinal.attempts === 'number')
					? finalZipErrorFinal.attempts
					: (hasErrorDetails ? finalZipErrorDetails.length : 0);
			
			if (finalZipErrorFinal) {
				errorInfo = {
					message: finalZipErrorFinal.error?.message || 'Final ZIP generation failed after multiple attempts',
					attempts: attempts,
					canRetry: access.isOwner, // Only owners can retry
					timestamp: finalZipErrorFinal.timestamp
				};
				
				// Include detailed error information for owners only
				if (access.isOwner && finalZipErrorDetails) {
					errorInfo.details = finalZipErrorDetails;
				}
			} else if (hasErrorAttempts || hasErrorDetails) {
				// Fallback if finalZipErrorFinal is missing but we have attempts/details
				errorInfo = {
					message: 'Final ZIP generation failed',
					attempts: attempts,
					canRetry: access.isOwner
				};
				
				// Include detailed error information for owners only
				if (access.isOwner && finalZipErrorDetails) {
					errorInfo.details = finalZipErrorDetails;
				}
			} else {
				// Last resort - we detected error state but no details
				errorInfo = {
					message: 'Final ZIP generation failed',
					attempts: attempts,
					canRetry: access.isOwner
				};
			}
		} else if (zipExists) {
			status = 'ready';
		} else if (order.finalZipGenerating) {
			status = 'generating';
			generating = true;
			// Include attempts count even during generation if there were previous failed attempts
			if (typeof finalZipErrorAttempts === 'number' && finalZipErrorAttempts > 0) {
				errorInfo = {
					message: 'Retrying ZIP generation',
					attempts: finalZipErrorAttempts,
					canRetry: false // Can't retry while generating
				};
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
		logger?.error('Failed to get final ZIP status', {
			galleryId: event?.pathParameters?.id,
			orderId: event?.pathParameters?.orderId,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to get final ZIP status', message: error.message })
		};
	}
});

