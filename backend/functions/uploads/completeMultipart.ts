import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, CompleteMultipartUploadCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface Part {
	partNumber: number;
	etag: string;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;

	if (!bucket) return { statusCode: 500, body: 'Missing bucket' };

	const body = event?.body ? JSON.parse(event.body) : {};
	const galleryId = body?.galleryId;
	const uploadId = body?.uploadId;
	const key = body?.key; // Full S3 key (objectKey)
	const parts: Part[] = body?.parts || [];

	if (!galleryId || !uploadId || !key || !Array.isArray(parts) || parts.length === 0) {
		return { 
			statusCode: 400, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'galleryId, uploadId, key, and parts array are required' })
		};
	}

	// Validate parts array
	if (parts.length > 10000) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Too many parts', message: 'Maximum 10,000 parts allowed' })
		};
	}

	// Enforce owner-only upload
	const table = envProc?.env?.GALLERIES_TABLE as string;
	if (!table) return { 
		statusCode: 500, 
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ error: 'Missing table' })
	};
	const requester = getUserIdFromEvent(event);
	const got = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId } }));
	const gallery = got.Item as any;
	if (!gallery) return { 
		statusCode: 404, 
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ error: 'not found' })
	};
	requireOwnerOr403(gallery.ownerId, requester);

	// Sort parts by part number and validate
	const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);
	
	// Validate part numbers are sequential starting from 1
	for (let i = 0; i < sortedParts.length; i++) {
		if (sortedParts[i].partNumber !== i + 1) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Invalid part numbers',
					message: 'Part numbers must be sequential starting from 1'
				})
			};
		}
	}

	// Complete multipart upload
	const completeCmd = new CompleteMultipartUploadCommand({
		Bucket: bucket,
		Key: key,
		UploadId: uploadId,
		MultipartUpload: {
			Parts: sortedParts.map(part => ({
				PartNumber: part.partNumber,
				ETag: part.etag,
			})),
		},
	});

	try {
		const response = await s3.send(completeCmd);
		
		// Get file size after completion to update bytesUsed atomically
		let fileSize = 0;
		try {
			const headResponse = await s3.send(new HeadObjectCommand({
				Bucket: bucket,
				Key: key
			}));
			fileSize = headResponse.ContentLength || 0;
		} catch (headErr: any) {
			// Log but don't fail - file was uploaded successfully
			const logger = (context as any)?.logger;
			logger?.warn('Failed to get file size after multipart completion', {
				error: headErr.message,
				galleryId,
				key
			});
		}

		// Update bytesUsed atomically if file size was retrieved
		if (fileSize > 0) {
			const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
			if (galleriesTable) {
				try {
					// Determine if this is an original or final upload based on key path
					const isOriginal = key.includes('/originals/');
					const isFinal = key.includes('/final/');
					
					if (isOriginal || isFinal) {
						// Use atomic ADD operation to prevent race conditions with concurrent uploads/deletions
						const updateExpressions: string[] = [];
						const expressionValues: Record<string, number> = {};
						
						if (isOriginal) {
							updateExpressions.push('originalsBytesUsed :originalsSize');
							expressionValues[':originalsSize'] = fileSize;
						}
						
						if (isFinal) {
							updateExpressions.push('finalsBytesUsed :finalsSize');
							expressionValues[':finalsSize'] = fileSize;
						}
						
						// Also update bytesUsed for backward compatibility (sum of both)
						updateExpressions.push('bytesUsed :totalSize');
						expressionValues[':totalSize'] = fileSize;
						
						await ddb.send(new UpdateCommand({
							TableName: galleriesTable,
							Key: { galleryId },
							UpdateExpression: `ADD ${updateExpressions.join(', ')}`,
							ExpressionAttributeValues: expressionValues
						}));
						
						const logger = (context as any)?.logger;
						logger?.info('Updated gallery bytesUsed after multipart upload (atomic)', {
							galleryId,
							key,
							fileSize,
							type: isOriginal ? 'original' : 'final'
						});
					}
				} catch (updateErr: any) {
					// Log but don't fail - upload was successful, bytesUsed update can be recalculated later
					const logger = (context as any)?.logger;
					logger?.warn('Failed to update gallery bytesUsed after multipart upload', {
						error: updateErr.message,
						galleryId,
						key,
						fileSize
					});
				}
			}
		}
		
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				success: true,
				key: response.Key,
				etag: response.ETag,
				location: response.Location,
			})
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Failed to complete multipart upload',
				message: error.message || 'Unknown error'
			})
		};
	}
});

