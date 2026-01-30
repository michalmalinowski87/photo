import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';
import { getConfigValueFromSsm } from '../../lib/src/ssm-config';
import { getCloudFrontSignedUrl, getCloudFrontPrivateKey, getCloudFrontKeyPairId } from '../../lib/src/cloudfront-signer';

// S3Client for checking if ZIP exists in S3 (before CloudFront propagation)
const s3 = new S3Client({
	region: process.env.AWS_REGION || 'eu-west-1',
	maxAttempts: 3,
	requestHandler: {
		requestTimeout: 30000, // 30s timeout
		httpsAgent: {
			keepAlive: true,
			maxSockets: 50,
			keepAliveMsecs: 30000
		}
	}
});

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
		const envProc = (globalThis as any).process;
		const bucket = envProc?.env?.GALLERIES_BUCKET as string;
		const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
		const ordersTable = envProc?.env?.ORDERS_TABLE as string;
		const stage = envProc?.env?.STAGE || 'dev';

		if (!bucket || !galleriesTable || !ordersTable) {
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Missing required environment variables' })
			};
		}

		// Get CloudFront configuration
		const cloudfrontDomain = await getConfigValueFromSsm(stage, 'CloudFrontDomain');
		const cloudfrontPrivateKey = await getCloudFrontPrivateKey(stage);
		const cloudfrontKeyPairId = await getCloudFrontKeyPairId(stage);

		if (!cloudfrontDomain || !cloudfrontPrivateKey || !cloudfrontKeyPairId) {
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'CloudFront configuration missing',
					message: 'CloudFront domain, private key, or key pair ID not configured'
				})
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

		// Verify access - supports both owner (Cognito) and client (JWT) tokens
		const access = await verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
			};
		}

		// For client access, check if gallery is paid before allowing access to finals
		// Owners can always access finals (even for unpublished galleries)
		if (access.isClient) {
			let isPaid = false;
			try {
				const paidTransaction = await getPaidTransactionForGallery(galleryId);
				isPaid = !!paidTransaction;
			} catch (err) {
				// If transaction check fails, fall back to gallery state
				isPaid = gallery.state === 'PAID_ACTIVE';
			}

			if (!isPaid) {
				return {
					statusCode: 403,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'Gallery not published',
						message: 'Final photos are not available until the gallery is published. Please contact the photographer.'
					})
				};
			}
		}

		// Verify order exists and is DELIVERED or PREPARING_DELIVERY
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
		if (order.deliveryStatus !== 'DELIVERED' && order.deliveryStatus !== 'PREPARING_DELIVERY') {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Order is not delivered or preparing delivery' })
			};
		}

		// Check if final ZIP exists - verify via CloudFront path
		const filename = `gallery-${galleryId}-order-${orderId}-final.zip`;
		const zipKey = `galleries/${galleryId}/orders/${orderId}/final-zip/${filename}`;
		
		// Check if ZIP exists in S3
		// Note: We check S3 directly because CloudFront requires signed URLs for HEAD requests too,
		// so an unsigned HEAD request will fail even if the file exists
		let zipSize: number | undefined;
		let zipExists = false;
		
		try {
			// Check if ZIP exists in S3
			const s3HeadResponse = await s3.send(new HeadObjectCommand({
				Bucket: bucket,
				Key: zipKey
			}));
			zipSize = s3HeadResponse.ContentLength;
			zipExists = true;
		} catch (s3Err: any) {
			if (s3Err.name === 'NoSuchKey' || s3Err.name === 'NotFound') {
				zipExists = false;
			} else {
				throw s3Err;
			}
		}
		
		// If ZIP exists in S3, generate CloudFront signed URL
		// CloudFront will serve from cache if available, or fetch from S3 if not cached yet
		// If CloudFront is not configured or fails, fall back to S3 presigned URL
		if (zipExists) {
			let downloadUrl: string;
			let urlType: 'cloudfront' | 's3' = 'cloudfront';
			
			// Try CloudFront first (preferred for performance)
			if (cloudfrontDomain && cloudfrontPrivateKey && cloudfrontKeyPairId) {
				try {
					// Build CloudFront URL
					const cloudfrontPath = zipKey.split('/').map(encodeURIComponent).join('/');
					const cloudfrontUrl = `https://${cloudfrontDomain}/${cloudfrontPath}`;
					
					downloadUrl = getCloudFrontSignedUrl(
						cloudfrontUrl,
						cloudfrontPrivateKey,
						cloudfrontKeyPairId,
						3600 // 1 hour expiration
					);
				} catch (cfError: any) {
					// CloudFront signing failed - fall back to S3
					const logger = (context as any).logger;
					logger?.warn('CloudFront signed URL generation failed, falling back to S3', {
						galleryId,
						orderId,
						error: cfError.message
					});
					
					// Generate S3 presigned URL as fallback
					const s3Command = new GetObjectCommand({
						Bucket: bucket,
						Key: zipKey
					});
					downloadUrl = await getSignedUrl(s3, s3Command, { expiresIn: 3600 });
					urlType = 's3';
				}
			} else {
				// CloudFront not configured - use S3 presigned URL
				const s3Command = new GetObjectCommand({
					Bucket: bucket,
					Key: zipKey
				});
				downloadUrl = await getSignedUrl(s3, s3Command, { expiresIn: 3600 });
				urlType = 's3';
			}
			
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					url: downloadUrl,
					filename,
					size: zipSize,
					expiresIn: 3600,
					source: urlType // Indicate whether URL is from CloudFront or S3
				})
			};
		}
		
		// ZIP doesn't exist - return 404
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'ZIP not found',
				message: 'Final ZIP file does not exist for this order. The ZIP may still be generating.'
			})
		};
	} catch (error: any) {
		const logger = (context as any).logger;
		logger?.error('Final ZIP download failed', {
			galleryId: event?.pathParameters?.id,
			orderId: event?.pathParameters?.orderId,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to generate download URL', 
				message: error.message,
				galleryId,
				orderId
			})
		};
	}
});

