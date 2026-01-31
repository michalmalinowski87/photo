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
		const zipErrorAttempts = order.zipErrorAttempts as number | undefined;
		const zipErrorDetails = order.zipErrorDetails as any[] | undefined;
		const zipErrorFinal = order.zipErrorFinal as any;
		const zipErrorFinalized = order.zipErrorFinalized;

		// Check for error state in zipProgress (legacy error status, for backward compatibility)
		const zipProgress = order.zipProgress as any;
		const hasLegacyError = zipProgress && typeof zipProgress === 'object' && !Array.isArray(zipProgress) && (zipProgress.status === 'error' || zipProgress.error);

		// Check for error state - be very permissive: check finalized flag, attempts, error details, or error final object
		const hasErrorAttempts = typeof zipErrorAttempts === 'number' && zipErrorAttempts > 0;
		const hasErrorDetails = Array.isArray(zipErrorDetails) && zipErrorDetails.length > 0;
		const hasErrorFinal = zipErrorFinal && typeof zipErrorFinal === 'object';
		const isErrorFinalized = zipErrorFinalized === true || zipErrorFinalized === 'true';

		if (hasLegacyError || isErrorFinalized || hasErrorAttempts || hasErrorDetails || hasErrorFinal) {
			status = 'error';
			
			// Ensure attempts is always a number, defaulting to 0 if missing
			const attempts = typeof zipErrorAttempts === 'number' 
				? zipErrorAttempts 
				: (zipErrorFinal?.attempts && typeof zipErrorFinal.attempts === 'number')
					? zipErrorFinal.attempts
					: (hasErrorDetails ? zipErrorDetails.length : (hasLegacyError ? 1 : 0));
			
			// One retry only: canRetry = owner AND retryCount < 1
			const retryCount = (order.zipRetryCount as number | undefined) ?? 0;
			const canRetry = access.isOwner && retryCount < 1;
			
			if (hasLegacyError) {
				// Legacy error format
				errorInfo = {
					message: zipProgress.error?.message || zipProgress.message || 'ZIP generation failed',
					attempts: attempts,
					canRetry
				};
			} else if (zipErrorFinal) {
				errorInfo = {
					message: zipErrorFinal.error?.message || 'ZIP generation failed after multiple attempts',
					attempts: attempts,
					canRetry,
					timestamp: zipErrorFinal.timestamp
				};
				
				// Include detailed error information for owners only
				if (access.isOwner && zipErrorDetails) {
					errorInfo.details = zipErrorDetails;
				}
			} else if (hasErrorAttempts || hasErrorDetails) {
				// Fallback if zipErrorFinal is missing but we have attempts/details
				errorInfo = {
					message: 'ZIP generation failed',
					attempts: attempts,
					canRetry
				};
				
				// Include detailed error information for owners only
				if (access.isOwner && zipErrorDetails) {
					errorInfo.details = zipErrorDetails;
				}
			} else {
				// Last resort - we detected error state but no details
				errorInfo = {
					message: 'ZIP generation failed',
					attempts: attempts,
					canRetry
				};
			}
		} else if (zipExists) {
			status = 'ready';
		} else if (order.zipGenerating) {
			// Stale generating: >25 min with no ZIP = likely failed without clearing flag
			const generatingSince = (order.zipGeneratingSince as number | undefined) ?? 0;
			const staleThresholdMs = 25 * 60 * 1000;
			if (generatingSince > 0 && Date.now() - generatingSince > staleThresholdMs) {
				status = 'error';
				errorInfo = {
					message: 'ZIP generation timed out or failed. Please try again.',
					attempts: 1,
					canRetry: access.isOwner && ((order.zipRetryCount as number | undefined) ?? 0) < 1
				};
			} else {
				status = 'generating';
				generating = true;
				// Include attempts count even during generation if there were previous failed attempts
				if (typeof zipErrorAttempts === 'number' && zipErrorAttempts > 0) {
					errorInfo = {
						message: 'Retrying ZIP generation',
						attempts: zipErrorAttempts,
						canRetry: false // Can't retry while generating
					};
				}
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

