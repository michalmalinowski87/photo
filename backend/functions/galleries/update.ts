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
	
	const expectedVersion = body.version;
	const currentVersion = gallery.version || 1;
	if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
		return {
			statusCode: 409,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Conflict',
				message: 'Gallery was modified by another operation. Please refresh and try again.',
				currentVersion,
				expectedVersion
			})
		};
	}
	
	const setExpressions: string[] = [];
	const removeExpressions: string[] = [];
	const expressionAttributeValues: Record<string, any> = {};
	const expressionAttributeNames: Record<string, string> = {};
	
	setExpressions.push('version = :version');
	expressionAttributeValues[':version'] = (currentVersion || 1) + 1;
	
	if (body.galleryName !== undefined && typeof body.galleryName === 'string') {
		setExpressions.push('#name = :name');
		expressionAttributeNames['#name'] = 'galleryName';
		expressionAttributeValues[':name'] = body.galleryName.trim();
	}
	
	if (body.clientEmail !== undefined && typeof body.clientEmail === 'string') {
		setExpressions.push('clientEmail = :clientEmail');
		expressionAttributeValues[':clientEmail'] = body.clientEmail.trim();
	}
	
	if (body.plan !== undefined && typeof body.plan === 'string') {
		setExpressions.push('#plan = :plan');
		expressionAttributeNames['#plan'] = 'plan';
		expressionAttributeValues[':plan'] = body.plan;
	}
	if (body.priceCents !== undefined && typeof body.priceCents === 'number') {
		setExpressions.push('priceCents = :priceCents');
		expressionAttributeValues[':priceCents'] = body.priceCents;
	}
	if (body.originalsLimitBytes !== undefined && typeof body.originalsLimitBytes === 'number') {
		setExpressions.push('originalsLimitBytes = :originalsLimitBytes');
		expressionAttributeValues[':originalsLimitBytes'] = body.originalsLimitBytes;
	}
	if (body.finalsLimitBytes !== undefined && typeof body.finalsLimitBytes === 'number') {
		setExpressions.push('finalsLimitBytes = :finalsLimitBytes');
		expressionAttributeValues[':finalsLimitBytes'] = body.finalsLimitBytes;
	}
	
	if (body.nextStepsCompleted !== undefined && typeof body.nextStepsCompleted === 'boolean') {
		setExpressions.push('nextStepsCompleted = :nextStepsCompleted');
		expressionAttributeValues[':nextStepsCompleted'] = body.nextStepsCompleted;
	}
	
	if (body.nextStepsOverlayDismissed !== undefined && typeof body.nextStepsOverlayDismissed === 'boolean') {
		setExpressions.push('nextStepsOverlayDismissed = :nextStepsOverlayDismissed');
		expressionAttributeValues[':nextStepsOverlayDismissed'] = body.nextStepsOverlayDismissed;
	}
	
	if (body.coverPhotoUrl !== undefined) {
		if (body.coverPhotoUrl === null || body.coverPhotoUrl === '') {
			removeExpressions.push('#cover');
			expressionAttributeNames['#cover'] = 'coverPhotoUrl';
			
			const bucket = envProc?.env?.GALLERIES_BUCKET as string;
			if (bucket && gallery.coverPhotoUrl) {
				try {
					let s3Key: string | undefined;
					
					if (gallery.coverPhotoUrl.includes('.s3.') || gallery.coverPhotoUrl.includes('s3.amazonaws.com')) {
						const urlObj = new URL(gallery.coverPhotoUrl);
						s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
					} else if (gallery.coverPhotoUrl.includes('/')) {
						const urlObj = new URL(gallery.coverPhotoUrl);
						const pathParts = urlObj.pathname.split('/').filter(p => p);
						s3Key = pathParts.map(decodeURIComponent).join('/');
					} else {
						s3Key = gallery.coverPhotoUrl;
					}
					
					if (!s3Key || !s3Key.includes('galleries/')) {
						s3Key = `galleries/${id}/cover.jpg`;
					}
					
					await s3.send(new DeleteObjectCommand({
						Bucket: bucket,
						Key: s3Key
					}));
				} catch (s3Err: any) {
					const logger = (context as any).logger;
					logger?.warn('Failed to delete cover image from S3', {
						galleryId: id,
						errorName: s3Err.name,
						errorMessage: s3Err.message
					});
				}
			}
		} else if (typeof body.coverPhotoUrl === 'string') {
			setExpressions.push('#cover = :cover');
			expressionAttributeNames['#cover'] = 'coverPhotoUrl';
			expressionAttributeValues[':cover'] = body.coverPhotoUrl.trim();
			
			const bucket = envProc?.env?.GALLERIES_BUCKET as string;
			if (bucket && gallery.coverPhotoUrl && gallery.coverPhotoUrl !== body.coverPhotoUrl.trim()) {
				try {
					const extractS3Key = (url: string): string => {
						if (url.includes('.s3.') || url.includes('s3.amazonaws.com')) {
							const urlObj = new URL(url);
							return urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
						} else if (url.includes('/')) {
							const urlObj = new URL(url);
							const pathParts = urlObj.pathname.split('/').filter(p => p);
							return pathParts.map(decodeURIComponent).join('/');
						} else {
							return url;
						}
					};
					
					const oldS3Key = extractS3Key(gallery.coverPhotoUrl);
					const newS3Key = extractS3Key(body.coverPhotoUrl.trim());
					
					// Only delete the old file if it's different from the new one
					// This prevents deleting the file we just uploaded when updating from S3 URL to CloudFront URL
					if (oldS3Key.includes(`galleries/${id}/cover`) && oldS3Key !== newS3Key) {
						await s3.send(new DeleteObjectCommand({
							Bucket: bucket,
							Key: oldS3Key
						}));
					}
				} catch (s3Err: any) {
					const logger = (context as any).logger;
					logger?.warn('Failed to delete old cover image from S3', {
						galleryId: id,
						errorName: s3Err.name,
						errorMessage: s3Err.message
					});
				}
			}
		}
	}
	
	if (body.loginPageLayout !== undefined && typeof body.loginPageLayout === 'string') {
		setExpressions.push('loginPageLayout = :loginPageLayout');
		expressionAttributeValues[':loginPageLayout'] = body.loginPageLayout.trim();
	}
	
	if (body.coverPhotoPosition !== undefined) {
		if (body.coverPhotoPosition === null) {
			removeExpressions.push('coverPhotoPosition');
		} else if (typeof body.coverPhotoPosition === 'object' && body.coverPhotoPosition !== null) {
			// Validate the object structure
			const position = body.coverPhotoPosition as {
				x?: number;
				y?: number;
				scale?: number;
				objectPosition?: string;
			};
			// Only update if it's a valid object
			if (
				position.x === undefined && 
				position.y === undefined && 
				position.scale === undefined && 
				position.objectPosition === undefined
			) {
				// Empty object, remove the field
				removeExpressions.push('coverPhotoPosition');
			} else {
				setExpressions.push('coverPhotoPosition = :coverPhotoPosition');
				expressionAttributeValues[':coverPhotoPosition'] = position;
			}
		}
	}
	
	if (body.watermarkUrl !== undefined) {
		if (body.watermarkUrl === null || body.watermarkUrl === '') {
			removeExpressions.push('watermarkUrl');
		} else if (typeof body.watermarkUrl === 'string') {
			setExpressions.push('watermarkUrl = :watermarkUrl');
			expressionAttributeValues[':watermarkUrl'] = body.watermarkUrl.trim();
		}
	}

	if (body.watermarkThumbnails !== undefined) {
		setExpressions.push('watermarkThumbnails = :watermarkThumbnails');
		expressionAttributeValues[':watermarkThumbnails'] = Boolean(body.watermarkThumbnails);
	}
	
	if (body.watermarkPosition !== undefined) {
		if (body.watermarkPosition === null) {
			removeExpressions.push('watermarkPosition');
		} else if (typeof body.watermarkPosition === 'object' && body.watermarkPosition !== null) {
			// Validate the object structure - support both new format (x, y) and legacy format (position string)
			const position = body.watermarkPosition as {
				x?: number;
				y?: number;
				scale?: number;
				opacity?: number;
				// Legacy support
				position?: string;
			};
			
			// Validate position enum (legacy format)
			const validPositions = [
				'top-left', 'top-center', 'top-right',
				'middle-left', 'center', 'middle-right',
				'bottom-left', 'bottom-center', 'bottom-right'
			];
			
			if (position.position && !validPositions.includes(position.position)) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Invalid watermark position' })
				};
			}
			
			// Validate x, y percentages (0-100)
			if (position.x !== undefined && (position.x < 0 || position.x > 100)) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Watermark x position must be between 0 and 100' })
				};
			}
			
			if (position.y !== undefined && (position.y < 0 || position.y > 100)) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Watermark y position must be between 0 and 100' })
				};
			}
			
			// Validate scale range (0.1 to 3.0)
			if (position.scale !== undefined && (position.scale < 0.1 || position.scale > 3.0)) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Watermark scale must be between 0.1 and 3.0' })
				};
			}
			
			// Validate opacity range (0.1 to 1.0)
			if (position.opacity !== undefined && (position.opacity < 0.1 || position.opacity > 1.0)) {
				return {
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ error: 'Watermark opacity must be between 0.1 and 1.0' })
				};
			}
			
			// Only update if it's a valid object
			if (position.x === undefined && position.y === undefined && position.position === undefined && position.scale === undefined && position.opacity === undefined) {
				// Empty object, remove the field
				removeExpressions.push('watermarkPosition');
			} else {
				setExpressions.push('watermarkPosition = :watermarkPosition');
				expressionAttributeValues[':watermarkPosition'] = position;
			}
		}
	}
	
	setExpressions.push('updatedAt = :u');
		expressionAttributeValues[':u'] = new Date().toISOString();
	
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
	
	const conditionExpression = expectedVersion !== undefined 
		? 'version = :expectedVersion'
		: undefined;
	if (conditionExpression && expectedVersion !== undefined) {
		expressionAttributeValues[':expectedVersion'] = expectedVersion;
	}
	
	const updateParams: any = {
		TableName: table,
		Key: { galleryId: id },
		UpdateExpression: updateExpression,
		ConditionExpression: conditionExpression,
		ExpressionAttributeValues: expressionAttributeValues,
		ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined
	};
	
		try {
		await ddb.send(new UpdateCommand(updateParams));
	} catch (err: any) {
		if (err.name === 'ConditionalCheckFailedException') {
			return {
				statusCode: 409,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Conflict',
					message: 'Gallery was modified by another operation. Please refresh and try again.',
					currentVersion: (gallery.version || 1) + 1,
					expectedVersion
				})
			};
		}
		throw err;
	}
	
	const updated = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId: id } }));
	
	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ galleryId: id, version: expressionAttributeValues[':version'], ...updated.Item })
	};
});

