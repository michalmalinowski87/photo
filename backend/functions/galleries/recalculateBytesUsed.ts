import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

// Debounce period: only recalculate once per 5 minutes per gallery to avoid excessive costs
const RECALCULATE_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

export async function calculateOriginalsSize(bucket: string, galleryId: string): Promise<number> {
	let totalSize = 0;
	let continuationToken: string | undefined;
	const prefix = `galleries/${galleryId}/originals/`;

	do {
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			ContinuationToken: continuationToken
		}));

		if (listResponse.Contents) {
			totalSize += listResponse.Contents.reduce((sum, obj) => sum + (obj.Size || 0), 0);
		}

		continuationToken = listResponse.NextContinuationToken;
	} while (continuationToken);

	return totalSize;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!galleriesTable || !bucket) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;

	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId is required' })
		};
	}

	// Verify gallery exists
	const galleryGet = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}

	// Only require auth if called from API (not programmatically)
	const isProgrammaticCall = event?.isProgrammaticCall === true;
	if (!isProgrammaticCall) {
		const requester = getUserIdFromEvent(event);
		requireOwnerOr403(gallery.ownerId, requester);
	}

	// Check debounce: only recalculate if enough time has passed since last recalculation
	const now = Date.now();
	const lastRecalculatedAt = gallery.lastBytesUsedRecalculatedAt ? new Date(gallery.lastBytesUsedRecalculatedAt).getTime() : 0;
	const timeSinceLastRecalculation = now - lastRecalculatedAt;
	
	if (!isProgrammaticCall && timeSinceLastRecalculation < RECALCULATE_DEBOUNCE_MS) {
		const remainingSeconds = Math.ceil((RECALCULATE_DEBOUNCE_MS - timeSinceLastRecalculation) / 1000);
		logger?.info('Recalculation debounced', { 
			galleryId, 
			timeSinceLastRecalculation,
			remainingSeconds 
		});
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				message: 'Recalculation skipped (debounced)',
				galleryId,
				bytesUsed: gallery.bytesUsed || 0,
				lastRecalculatedAt: gallery.lastBytesUsedRecalculatedAt,
				remainingSeconds
			})
		};
	}

	// Call the shared recalculation logic
	return await recalculateBytesUsedInternal(galleryId, galleriesTable, bucket, gallery, logger);
});

// Shared recalculation logic that can be called from other functions
export async function recalculateBytesUsedInternal(
	galleryId: string,
	galleriesTable: string,
	bucket: string,
	gallery: any,
	logger: any
): Promise<any> {
	// Calculate actual size from S3
	let actualSize = 0;
	try {
		actualSize = await calculateOriginalsSize(bucket, galleryId);
		logger?.info('Calculated originals size from S3', { galleryId, actualSize });
	} catch (err: any) {
		logger?.error('Failed to calculate originals size', {
			error: err.message,
			galleryId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to calculate storage size', message: err.message })
		};
	}

	// Update gallery bytesUsed with actual size and record recalculation timestamp
	try {
		await ddb.send(new UpdateCommand({
			TableName: galleriesTable,
			Key: { galleryId },
			UpdateExpression: 'SET bytesUsed = :size, lastBytesUsedRecalculatedAt = :timestamp',
			ExpressionAttributeValues: {
				':size': actualSize,
				':timestamp': new Date().toISOString()
			}
		}));
		logger?.info('Recalculated gallery bytesUsed', { galleryId, oldBytesUsed: gallery.bytesUsed || 0, newBytesUsed: actualSize });
	} catch (updateErr: any) {
		logger?.error('Failed to update gallery bytesUsed', {
			error: updateErr.message,
			galleryId,
			size: actualSize
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to update bytesUsed', message: updateErr.message })
		};
	}

	// Get updated gallery to return current storage usage
	const updatedGallery = await ddb.send(new GetCommand({
		TableName: galleriesTable,
		Key: { galleryId }
	}));

	const updatedBytesUsed = updatedGallery.Item?.bytesUsed || 0;
	const storageLimitBytes = updatedGallery.Item?.storageLimitBytes || 0;

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			message: 'bytesUsed recalculated successfully',
			galleryId,
			oldBytesUsed: gallery.bytesUsed || 0,
			bytesUsed: updatedBytesUsed,
			storageLimitBytes,
			storageUsedMB: (updatedBytesUsed / (1024 * 1024)).toFixed(2),
			storageLimitMB: (storageLimitBytes / (1024 * 1024)).toFixed(2)
		})
	};
}

