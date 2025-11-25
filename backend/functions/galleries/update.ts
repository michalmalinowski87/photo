import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const table = envProc?.env?.GALLERIES_TABLE as string;
	if (!table) return { statusCode: 500, body: 'Missing table' };
	
	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: 'missing id' };
	
	const body = event?.body ? JSON.parse(event.body) : {};
	const requester = getUserIdFromEvent(event);
	
	const got = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId: id } }));
	const gallery = got.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	
	requireOwnerOr403(gallery.ownerId, requester);
	
	// Build update expression dynamically based on provided fields
	const setExpressions: string[] = [];
	const removeExpressions: string[] = [];
	const expressionAttributeValues: Record<string, any> = {};
	const expressionAttributeNames: Record<string, string> = {};
	
	// Allow updating galleryName
	if (body.galleryName !== undefined && typeof body.galleryName === 'string') {
		setExpressions.push('#name = :name');
		expressionAttributeNames['#name'] = 'galleryName';
		expressionAttributeValues[':name'] = body.galleryName.trim();
	}
	
	// Allow updating or removing coverPhotoUrl
	if (body.coverPhotoUrl !== undefined) {
		if (body.coverPhotoUrl === null || body.coverPhotoUrl === '') {
			// Remove coverPhotoUrl attribute and delete S3 file
			removeExpressions.push('#cover');
			expressionAttributeNames['#cover'] = 'coverPhotoUrl';
			
			// Delete cover image from S3
			const bucket = envProc?.env?.GALLERIES_BUCKET as string;
			if (bucket && gallery.coverPhotoUrl) {
				try {
					// Extract S3 key from coverPhotoUrl
					// Could be S3 URL, CloudFront URL, or just the key
					let s3Key: string | undefined;
					
					if (gallery.coverPhotoUrl.includes('.s3.') || gallery.coverPhotoUrl.includes('s3.amazonaws.com')) {
						// S3 URL format
						const urlObj = new URL(gallery.coverPhotoUrl);
						s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
					} else if (gallery.coverPhotoUrl.includes('/')) {
						// CloudFront URL or direct key - extract key after domain
						const urlObj = new URL(gallery.coverPhotoUrl);
						const pathParts = urlObj.pathname.split('/').filter(p => p);
						// Decode URL-encoded parts and reconstruct key
						s3Key = pathParts.map(decodeURIComponent).join('/');
					} else {
						// Assume it's already a key
						s3Key = gallery.coverPhotoUrl;
					}
					
					// If we couldn't extract a key, try default location
					if (!s3Key || !s3Key.includes('galleries/')) {
						s3Key = `galleries/${id}/cover.jpg`;
					}
					
					await s3.send(new DeleteObjectCommand({
						Bucket: bucket,
						Key: s3Key
					}));
				} catch (s3Err: any) {
					// Log but don't fail the update if S3 deletion fails
					console.warn('Failed to delete cover image from S3', { error: s3Err.message, galleryId: id });
				}
			}
		} else if (typeof body.coverPhotoUrl === 'string') {
			// Set new coverPhotoUrl
			setExpressions.push('#cover = :cover');
			expressionAttributeNames['#cover'] = 'coverPhotoUrl';
			expressionAttributeValues[':cover'] = body.coverPhotoUrl.trim();
			
			// Delete old cover photo from S3 if it exists and is different
			const bucket = envProc?.env?.GALLERIES_BUCKET as string;
			if (bucket && gallery.coverPhotoUrl && gallery.coverPhotoUrl !== body.coverPhotoUrl.trim()) {
				try {
					// Extract S3 key from old coverPhotoUrl
					const extractS3Key = (url: string): string => {
						if (url.includes('.s3.') || url.includes('s3.amazonaws.com')) {
							// S3 URL format - extract key
							const urlObj = new URL(url);
							return urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
						} else if (url.includes('/')) {
							// CloudFront URL - extract pathname and decode if needed
							const urlObj = new URL(url);
							const pathParts = urlObj.pathname.split('/').filter(p => p);
							// Decode URL-encoded parts to get the raw S3 key
							return pathParts.map(decodeURIComponent).join('/');
						} else {
							// Assume it's already a key
							return url;
						}
					};
					
					const oldS3Key = extractS3Key(gallery.coverPhotoUrl);
					
					// Only delete if it's a cover photo (starts with galleries/{galleryId}/cover)
					if (oldS3Key.includes(`galleries/${id}/cover`)) {
						await s3.send(new DeleteObjectCommand({
							Bucket: bucket,
							Key: oldS3Key
						}));
					}
				} catch (s3Err: any) {
					// Log but don't fail the update if S3 deletion fails
					console.warn('Failed to delete old cover image from S3', { 
						error: s3Err.message, 
						galleryId: id 
					});
				}
			}
			
			// Note: CloudFront invalidation is not needed since we use unique filenames
			// Each upload gets a new filename (cover_{timestamp}.jpg), so CloudFront
			// will naturally fetch the new image without cache issues
		}
	}
	
	// Always update updatedAt
	setExpressions.push('updatedAt = :u');
	expressionAttributeValues[':u'] = new Date().toISOString();
	
	// Build UpdateExpression - SET and REMOVE must be separate clauses
	const updateExpressionParts: string[] = [];
	if (setExpressions.length > 0) {
		updateExpressionParts.push(`SET ${setExpressions.join(', ')}`);
	}
	if (removeExpressions.length > 0) {
		updateExpressionParts.push(`REMOVE ${removeExpressions.join(', ')}`);
	}
	
	if (updateExpressionParts.length === 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'No valid fields to update' })
		};
	}
	
	const updateExpression = updateExpressionParts.join(' ');
	
	const updateParams: any = {
		TableName: table,
		Key: { galleryId: id },
		UpdateExpression: updateExpression,
		ExpressionAttributeValues: expressionAttributeValues
	};
	
	if (Object.keys(expressionAttributeNames).length > 0) {
		updateParams.ExpressionAttributeNames = expressionAttributeNames;
	}
	
	await ddb.send(new UpdateCommand(updateParams));
	
	// Return updated gallery
	const updated = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId: id } }));
	
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(updated.Item)
	};
});

