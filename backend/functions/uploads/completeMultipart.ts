import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, CompleteMultipartUploadCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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
	const fileSize = body?.fileSize; // File size in bytes (from frontend)

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
		
		const logger = (context as any)?.logger;
		const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
		const imagesTable = envProc?.env?.IMAGES_TABLE as string;
		
		// Get file size and metadata: prefer from request, fallback to HeadObjectCommand
		let actualFileSize = fileSize;
		let etag: string | undefined = response.ETag?.replace(/"/g, ''); // Remove quotes from ETag
		let lastModified: number = Date.now();
		if (!actualFileSize || actualFileSize <= 0 || !etag) {
			try {
				const headResponse = await s3.send(new HeadObjectCommand({
					Bucket: bucket,
					Key: key
				}));
				actualFileSize = headResponse.ContentLength || 0;
				etag = headResponse.ETag?.replace(/"/g, '') || etag;
				lastModified = headResponse.LastModified?.getTime() || Date.now();
			} catch (headErr: any) {
				logger?.warn('Failed to get file metadata after multipart completion', {
					error: headErr.message,
					galleryId,
					key
				});
			}
		}

		// Update storage usage atomically if file size is available
		if (actualFileSize > 0 && galleriesTable) {
			try {
				// Determine if this is an original or final upload based on key path
				const isOriginal = key.includes('/originals/');
				const isFinal = key.includes('/final/');

				// For finals, exclude previews/thumbs/bigthumbs subdirectories - only track actual final images
				// Structure: galleries/{galleryId}/final/{orderId}/{filename} (exactly 2 parts after /final/)
				// We want to exclude: galleries/{galleryId}/final/{orderId}/previews/... or .../thumbs/... or .../bigthumbs/...
				let isValidFinal = false;
				if (isFinal) {
					const afterFinal = key.split('/final/')[1];
					const pathParts = afterFinal.split('/');
					// Should have exactly 2 parts: orderId and filename (no subdirectories)
					isValidFinal = pathParts.length === 2 && pathParts[0] && pathParts[1];
				}
				
				if (isOriginal || (isFinal && isValidFinal)) {
					// Extract filename from key for logging (no maps needed - we store only totals)
					let filename: string;
					let orderId: string | undefined;
					if (isOriginal) {
						filename = key.split('/originals/')[1];
					} else {
						// For finals: galleries/{galleryId}/final/{orderId}/{filename}
						// We already validated it has exactly 2 parts above
						const parts = key.split('/final/')[1].split('/');
						orderId = parts[0];
						filename = parts[parts.length - 1]; // Get last part (filename)
					}
					
					// Use atomic ADD operation to prevent race conditions with concurrent uploads/deletions
					// Store only totals - no maps needed (simpler, scales infinitely, avoids 400KB DynamoDB limit)
					const updateExpressions: string[] = [];
					const expressionValues: Record<string, any> = {};
					
					if (isOriginal) {
						updateExpressions.push('originalsBytesUsed :originalsSize');
						expressionValues[':originalsSize'] = actualFileSize;
					}
					
					if (isFinal) {
						updateExpressions.push('finalsBytesUsed :finalsSize');
						expressionValues[':finalsSize'] = actualFileSize;
					}
					
					await ddb.send(new UpdateCommand({
						TableName: galleriesTable,
						Key: { galleryId },
						UpdateExpression: `ADD ${updateExpressions.join(', ')}`,
						ExpressionAttributeValues: expressionValues
					}));

					// Write image metadata to ImagesTable
					if (imagesTable) {
						// Construct imageKey: format "original#{filename}" or "final#{orderId}#{filename}"
						const imageKey = isOriginal 
							? `original#${filename}`
							: `final#${orderId}#${filename}`;

						try {
							await ddb.send(new PutCommand({
								TableName: imagesTable,
								Item: {
									galleryId,
									imageKey,
									type: isOriginal ? 'original' : 'final',
									filename,
									orderId: isFinal ? orderId : undefined,
									s3Key: key,
									size: actualFileSize,
									lastModified,
									etag: etag || '',
									hasPreview: false,
									hasBigThumb: false,
									hasThumb: false
								},
								// Conditional write: only update if ETag changed or record doesn't exist
								ConditionExpression: 'attribute_not_exists(etag) OR etag <> :etag OR lastModified < :lm',
								ExpressionAttributeValues: {
									':etag': etag || '',
									':lm': lastModified
								}
							}));

							logger?.info('Wrote image metadata to DynamoDB', {
								galleryId,
								imageKey,
								filename,
								type: isOriginal ? 'original' : 'final',
								etag,
								lastModified
							});
						} catch (metadataErr: any) {
							// If conditional check failed (ETag matches and newer), that's okay - idempotent retry
							if (metadataErr.name === 'ConditionalCheckFailedException') {
								logger?.info('Image metadata already exists with same or newer ETag (idempotent retry)', {
									galleryId,
									imageKey,
									etag
								});
							} else {
								// Metadata write failed - this is critical, log error but don't fail upload
								logger?.error('Failed to write image metadata to DynamoDB', {
									error: metadataErr.message,
									galleryId,
									imageKey,
									key
								});
								// Still return success but note metadata failure
								return {
									statusCode: 500,
									headers: { 'content-type': 'application/json' },
									body: JSON.stringify({ 
										error: 'Upload completed but metadata write failed',
										message: 'File uploaded successfully but failed to record metadata. Please retry.',
										key: response.Key,
										etag: response.ETag,
										location: response.Location
									})
								};
							}
						}
					}
					
					logger?.info('Updated gallery storage totals after multipart upload (atomic)', {
						galleryId,
						key,
						filename,
						fileSize: actualFileSize,
						type: isOriginal ? 'original' : 'final'
					});
				}
			} catch (updateErr: any) {
				// Log but don't fail - upload was successful, storage update can be recalculated later
				logger?.warn('Failed to update gallery storage usage after multipart upload', {
					error: updateErr.message,
					galleryId,
					key,
					fileSize: actualFileSize
				});
			}
		}
		
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				success: true,
				metadataWritten: true,
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

