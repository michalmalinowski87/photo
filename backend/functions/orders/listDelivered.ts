import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getJWTFromEvent } from '../../lib/src/jwt';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const cloudfrontDomain = envProc?.env?.CLOUDFRONT_DOMAIN as string;
	if (!galleriesTable || !ordersTable || !bucket) return { statusCode: 500, body: 'Missing env' };
	const galleryId = event?.pathParameters?.id;
	if (!galleryId) return { statusCode: 400, body: 'missing id' };

	// Verify JWT token for client access
	const jwtPayload = getJWTFromEvent(event);
	if (!jwtPayload || jwtPayload.galleryId !== galleryId) {
		return { statusCode: 401, body: 'Unauthorized. Please log in.' };
	}

	// Verify gallery exists
	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'gallery not found' };

	// Query for DELIVERED orders
	const ordersQuery = await ddb.send(new QueryCommand({
		TableName: ordersTable,
		KeyConditionExpression: 'galleryId = :g',
		FilterExpression: 'deliveryStatus = :ds',
		ExpressionAttributeValues: {
			':g': galleryId,
			':ds': 'DELIVERED'
		}
	}));

	// For each order, fetch final images
	const ordersWithImages = await Promise.all(
		(ordersQuery.Items || []).map(async (order: any) => {
			const orderId = order.orderId;
			const prefix = `galleries/${galleryId}/final/${orderId}/`;
			
			try {
				const listResponse = await s3.send(new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: prefix,
					Delimiter: '/'
				}));

				const images = (listResponse.Contents || [])
					.map(obj => {
						const fullKey = obj.Key || '';
						if (!fullKey.startsWith(prefix)) {
							return null;
						}
						const filename = fullKey.replace(prefix, '');
						if (!filename || filename.includes('/')) {
							return null;
						}
						
						const finalKey = `galleries/${galleryId}/final/${orderId}/${filename}`;
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
					orderId: order.orderId,
					orderNumber: order.orderNumber,
					deliveredAt: order.deliveredAt || order.createdAt,
					selectedCount: order.selectedCount || 0,
					createdAt: order.createdAt,
					images,
					imageCount: images.length
				};
			} catch (err: any) {
				logger.error('Failed to list final images for order', {
					error: err.message,
					galleryId,
					orderId
				});
				// Return order without images if listing fails
				return {
					orderId: order.orderId,
					orderNumber: order.orderNumber,
					deliveredAt: order.deliveredAt || order.createdAt,
					selectedCount: order.selectedCount || 0,
					createdAt: order.createdAt,
					images: [],
					imageCount: 0
				};
			}
		})
	);

	const orders = ordersWithImages.sort((a: any, b: any) => {
		// Sort by deliveredAt descending (newest first)
		const dateA = new Date(a.deliveredAt || a.createdAt || 0).getTime();
		const dateB = new Date(b.deliveredAt || b.createdAt || 0).getTime();
		return dateB - dateA;
	});

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ items: orders })
	};
});

