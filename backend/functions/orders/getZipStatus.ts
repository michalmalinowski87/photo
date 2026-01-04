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
		let elapsedSeconds: number | undefined;
		let progress: {
			processed: number;
			total: number;
			percent: number;
			status?: string;
			message?: string;
			error?: string;
		} | undefined;

		// Check for error state in zipProgress
		const zipProgress = order.zipProgress as any;
		
		// Helper function to build progress object from separate fields or object
		const buildProgressObject = (
			progressValue: any,
			progressTotal: number | undefined,
			progressPercent: number | undefined
		) => {
			// If progressValue is an object (new format), use it directly
			if (progressValue && typeof progressValue === 'object' && !Array.isArray(progressValue)) {
				// Check if it has the expected structure
				if (progressValue.processed !== undefined || progressValue.total !== undefined) {
					return {
						processed: progressValue.processed,
						total: progressValue.total,
						percent: progressValue.progressPercent || progressValue.percent,
						status: progressValue.status,
						message: progressValue.message,
						error: progressValue.error
					};
				}
			}
			// If progressValue is a number and we have separate fields (old format), construct object
			if (typeof progressValue === 'number' && progressTotal !== undefined && progressTotal > 0) {
				return {
					processed: progressValue,
					total: progressTotal,
					percent: progressPercent !== undefined ? progressPercent : Math.round((progressValue / progressTotal) * 100)
				};
			}
			return undefined;
		};
		
		// Check for error state (only if zipProgress is an object with error)
		if (zipProgress && typeof zipProgress === 'object' && !Array.isArray(zipProgress) && (zipProgress.status === 'error' || zipProgress.error)) {
			status = 'error';
			progress = {
				processed: zipProgress.processed || 0,
				total: zipProgress.total || 0,
				percent: zipProgress.progressPercent || 0,
				status: 'error',
				message: zipProgress.message || zipProgress.error,
				error: zipProgress.error || zipProgress.message
			};
			elapsedSeconds = zipProgress.elapsedSeconds;
		} else if (zipExists) {
			status = 'ready';
		} else if (order.zipGenerating) {
			status = 'generating';
			generating = true;
			const zipGeneratingSince = order.zipGeneratingSince as number | undefined;
			if (zipGeneratingSince) {
				elapsedSeconds = Math.round((Date.now() - zipGeneratingSince) / 1000);
			}
			
			// Include progress if available - check separate fields format first (current format)
			const builtProgress = buildProgressObject(
				order.zipProgress,
				order.zipProgressTotal,
				order.zipProgressPercent
			);
			if (builtProgress) {
				progress = builtProgress;
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
				elapsedSeconds,
				progress
			})
		};
	} catch (error: any) {
		console.error('Failed to get ZIP status:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to get ZIP status', message: error.message })
		};
	}
});

