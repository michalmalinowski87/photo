import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const cloudfrontDomain = envProc?.env?.CLOUDFRONT_DOMAIN as string;

	if (!bucket || !galleriesTable || !ordersTable) {
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

		// Verify access - supports both owner (Cognito) and client (JWT) tokens
		const access = verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
			};
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

		// List final images for this order
		// Final images are stored at: galleries/{galleryId}/final/{orderId}/{filename}
		const prefix = `galleries/${galleryId}/final/${orderId}/`;
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			Delimiter: '/' // Only return objects directly under this prefix, not subdirectories
		}));

		const images = (listResponse.Contents || [])
			.map(obj => {
				const fullKey = obj.Key || '';
				// Ensure the key matches our expected prefix exactly
				if (!fullKey.startsWith(prefix)) {
					return null;
				}
				const filename = fullKey.replace(prefix, '');
				// Skip if empty or contains slashes (subdirectories)
				if (!filename || filename.includes('/')) {
					return null;
				}
				
				const finalKey = `galleries/${galleryId}/final/${orderId}/${filename}`;
				
				// Build CloudFront URL - encode path segments
				const finalUrl = cloudfrontDomain 
					? `https://${cloudfrontDomain}/${finalKey.split('/').map(encodeURIComponent).join('/')}`
					: null;

				return {
					key: filename,
					finalUrl,
					size: obj.Size || 0,
					lastModified: obj.LastModified?.toISOString()
				};
			})
			.filter(Boolean)
			.sort((a, b) => {
				return (a?.key || '').localeCompare(b?.key || '');
			});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				orderId,
				images,
				count: images.length
			})
		};
	} catch (error: any) {
		logger.error('List final images for order failed', {
			error: {
				name: error.name,
				message: error.message,
				code: error.code,
				stack: error.stack
			},
			galleryId,
			orderId,
			bucket
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list final images', message: error.message })
		};
	}
});

