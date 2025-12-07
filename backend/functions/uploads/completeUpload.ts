import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import type { LambdaEvent, LambdaContext, GalleryItem } from '../../lib/src/lambda-types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Completion handler for simple PUT uploads
 * Updates storage usage immediately using fileSize from frontend
 * Stores file size in gallery record's imageSizes map
 */
export const handler = lambdaLogger(async (event: LambdaEvent, context: LambdaContext) => {
	const envProc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;

	if (!galleriesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing GALLERIES_TABLE environment variable' })
		};
	}

	const body = event?.body ? JSON.parse(event.body) : {};
	const galleryId = body?.galleryId;
	const key = body?.key; // Full S3 key (objectKey)
	const fileSize = body?.fileSize; // File size in bytes (required from frontend)

	if (!galleryId || !key || !fileSize || fileSize <= 0) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'galleryId, key, and fileSize are required',
				message: 'fileSize must be greater than 0'
			})
		};
	}

	// Enforce owner-only upload
	const requester = getUserIdFromEvent(event);
	const galleryGet = await ddb.send(new GetCommand({ 
		TableName: galleriesTable, 
		Key: { galleryId } 
	}));
	const gallery = galleryGet.Item as GalleryItem | undefined;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}
	requireOwnerOr403(gallery.ownerId, requester);

	const logger = context.logger;

	try {
		// Determine if this is an original or final upload based on key path
		const isOriginal = key.includes('/originals/');
		const isFinal = key.includes('/final/');

		// For finals, exclude previews/thumbs/bigthumbs subdirectories - only track actual final images
		// Structure: galleries/{galleryId}/final/{orderId}/{filename} (exactly 2 parts after /final/)
		// We want to exclude: galleries/{galleryId}/final/{orderId}/previews/... or .../thumbs/... or .../bigthumbs/...
		if (isFinal) {
			const afterFinal = key.split('/final/')[1];
			const pathParts = afterFinal.split('/');
			// Should have exactly 2 parts: orderId and filename (no subdirectories)
			const isValidFinal = pathParts.length === 2 && pathParts[0] && pathParts[1];
			if (!isValidFinal) {
				// Final file in subdirectory (previews/thumbs/bigthumbs) - skip storage tracking
				return {
					statusCode: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						success: true,
						message: 'Upload completed (preview/thumb, not tracked for storage)'
					})
				};
			}
		}

		if (!isOriginal && !isFinal) {
			// Not an original or final, no storage tracking needed
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					success: true,
					message: 'Upload completed (not tracked for storage)'
				})
			};
		}

		// Extract filename from key for logging (no maps needed - we store only totals)
		let filename: string;
		if (isOriginal) {
			filename = key.split('/originals/')[1];
		} else {
			// For finals: galleries/{galleryId}/final/{orderId}/{filename}
			// We already validated it has exactly 2 parts above
			const parts = key.split('/final/')[1].split('/');
			filename = parts[parts.length - 1]; // Get last part (filename)
		}

		// Use atomic ADD operation to prevent race conditions with concurrent uploads/deletions
		// Store only totals - no maps needed (simpler, scales infinitely, avoids 400KB DynamoDB limit)
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

		const updateExpression = `ADD ${updateExpressions.join(', ')}`;

		await ddb.send(new UpdateCommand({
			TableName: galleriesTable,
			Key: { galleryId },
			UpdateExpression: updateExpression,
			ExpressionAttributeValues: expressionValues
		}));

		logger?.info('Updated gallery storage totals after simple PUT upload (atomic)', {
			galleryId,
			key,
			filename,
			fileSize,
			type: isOriginal ? 'original' : 'final'
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				success: true,
				message: 'Upload completed and storage updated'
			})
		};
	} catch (updateErr: unknown) {
		// Log but don't fail - upload was successful, storage update can be recalculated later
		const errorMessage = updateErr instanceof Error ? updateErr.message : String(updateErr);
		logger?.warn('Failed to update gallery storage usage after simple PUT upload', {
			error: errorMessage,
			galleryId,
			key,
			fileSize
		});

		// Still return success since the upload itself was successful
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				success: true,
				message: 'Upload completed (storage update failed, can be recalculated)',
				warning: 'Storage update failed'
			})
		};
	}
});

