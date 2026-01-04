import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifyGalleryAccess } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

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

		// Supports both owner (Cognito) and client (JWT) tokens
		const access = await verifyGalleryAccess(event, galleryId, gallery);
		if (!access.isOwner && !access.isClient) {
			return {
				statusCode: 401,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
			};
		}

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

		if (order.deliveryStatus === 'CANCELLED') {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Cannot download ZIP for canceled order' })
			};
		}

		// Check if ZIP exists in S3 - this endpoint only returns presigned URLs, no generation
		const expectedZipKey = `galleries/${galleryId}/zips/${orderId}.zip`;
		
		let zipSize: number | undefined;
		let zipExists = false;
		
		try {
			const headResponse = await s3.send(new HeadObjectCommand({
				Bucket: bucket,
				Key: expectedZipKey
			}));
			zipSize = headResponse.ContentLength;
			zipExists = true;
		} catch (headErr: any) {
			if (headErr.name === 'NoSuchKey' || headErr.name === 'NotFound') {
				zipExists = false;
			} else {
				throw headErr;
			}
		}
		
		// If ZIP exists, return presigned URL
		if (zipExists) {
			const getObjectCmd = new GetObjectCommand({
				Bucket: bucket,
				Key: expectedZipKey,
				ResponseContentDisposition: `attachment; filename="${orderId}.zip"`
			});
			const presignedUrl = await getSignedUrl(s3, getObjectCmd, { expiresIn: 3600 });
			
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					url: presignedUrl,
					filename: `${orderId}.zip`,
					size: zipSize,
					expiresIn: 3600
				})
			};
		}
		
		// ZIP doesn't exist - return 404
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'ZIP not found',
				message: 'ZIP file does not exist for this order. The ZIP may still be generating.'
			})
		};
	} catch (error: any) {
		console.error('Failed to generate download URL:', error);
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to generate download URL', message: error.message })
		};
	}
});

