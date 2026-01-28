import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!usersTable || !bucket) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing configuration' })
		};
	}

	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	const body = event?.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
	const watermarkUrl = event?.queryStringParameters?.url || body?.url;
	if (!watermarkUrl) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing watermark URL' })
		};
	}

	try {
		// Get current watermarks
		const result = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId },
			ProjectionExpression: 'watermarks, defaultWatermarkUrl'
		}));

		const watermarks = result.Item?.watermarks || [];
		const defaultWatermarkUrl = result.Item?.defaultWatermarkUrl;

		// Normalize URLs for comparison (extract S3 key from both CloudFront and S3 URLs)
		const normalizeUrl = (url: string): string => {
			try {
				const urlObj = new URL(url);
				let key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
				return decodeURIComponent(key);
			} catch {
				return url;
			}
		};

		const normalizedTargetUrl = normalizeUrl(watermarkUrl);

		// Find and remove the watermark (match by normalized S3 key)
		const watermarkToDelete = watermarks.find((wm: any) => {
			if (!wm.url) return false;
			// Try exact match first
			if (wm.url === watermarkUrl) return true;
			// Try normalized match (handles CloudFront vs S3 URL differences)
			const normalizedWmUrl = normalizeUrl(wm.url);
			return normalizedWmUrl === normalizedTargetUrl;
		});

		if (!watermarkToDelete) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Watermark not found' })
			};
		}

		// Remove from array (match by normalized URL)
		const updatedWatermarks = watermarks.filter((wm: any) => {
			if (!wm.url) return true;
			if (wm.url === watermarkUrl) return false;
			const normalizedWmUrl = normalizeUrl(wm.url);
			return normalizedWmUrl !== normalizedTargetUrl;
		});

		// Update users table
		await ddb.send(new UpdateCommand({
			TableName: usersTable,
			Key: { userId },
			UpdateExpression: 'SET watermarks = :watermarks, updatedAt = :updatedAt',
			ExpressionAttributeValues: {
				':watermarks': updatedWatermarks,
				':updatedAt': new Date().toISOString()
			}
		}));

		// If this was the default watermark, clear it (check both exact and normalized match)
		const normalizedDefaultUrl = defaultWatermarkUrl ? normalizeUrl(defaultWatermarkUrl) : null;
		if (defaultWatermarkUrl === watermarkUrl || normalizedDefaultUrl === normalizedTargetUrl) {
			await ddb.send(new UpdateCommand({
				TableName: usersTable,
				Key: { userId },
				UpdateExpression: 'SET defaultWatermarkUrl = :empty, updatedAt = :updatedAt',
				ExpressionAttributeValues: {
					':empty': '',
					':updatedAt': new Date().toISOString()
				}
			}));
		}

		// Delete from S3
		try {
			// Extract S3 key from URL
			const urlObj = new URL(watermarkUrl);
			let s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
			
			// If it's a CloudFront URL, we need to get the S3 key
			// CloudFront URLs have the same path structure as S3 keys
			if (s3Key) {
				await s3.send(new DeleteObjectCommand({
					Bucket: bucket,
					Key: decodeURIComponent(s3Key)
				}));
			}
		} catch (s3Error) {
			logger?.warn('Failed to delete watermark from S3', { error: s3Error, watermarkUrl });
			// Continue even if S3 delete fails - metadata is already updated
		}

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'Watermark deleted successfully' })
		};
	} catch (error: any) {
		logger?.error('Delete watermark failed', {
			error: { name: error.name, message: error.message },
			userId,
			watermarkUrl
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to delete watermark', message: error.message })
		};
	}
});
