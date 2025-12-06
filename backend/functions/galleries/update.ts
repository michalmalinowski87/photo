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
					console.warn('Failed to delete cover image from S3', { error: s3Err.message, galleryId: id });
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
					
					if (oldS3Key.includes(`galleries/${id}/cover`)) {
						await s3.send(new DeleteObjectCommand({
							Bucket: bucket,
							Key: oldS3Key
						}));
					}
				} catch (s3Err: any) {
					console.warn('Failed to delete old cover image from S3', { 
						error: s3Err.message, 
						galleryId: id 
					});
				}
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

