import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { cancelExpirySchedule, createExpirySchedule, getScheduleName } from '../../lib/src/expiry-scheduler';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Dev endpoint to set gallery expiry date/time and create/update EventBridge schedule
 * Only available in development/staging environments
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const deletionLambdaArn = envProc?.env?.GALLERY_EXPIRY_DELETION_LAMBDA_ARN as string;
	const scheduleRoleArn = envProc?.env?.GALLERY_EXPIRY_SCHEDULE_ROLE_ARN as string;
	const dlqArn = envProc?.env?.GALLERY_EXPIRY_DLQ_ARN as string;
	const stage = envProc?.env?.STAGE as string;

	// Only allow in dev/staging
	if (stage === 'prod') {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'This endpoint is not available in production' })
		};
	}

	if (!galleriesTable || !deletionLambdaArn || !scheduleRoleArn || !dlqArn) {
		logger.error('Missing required environment variables', {
			galleriesTable: !!galleriesTable,
			deletionLambdaArn: !!deletionLambdaArn,
			scheduleRoleArn: !!scheduleRoleArn,
			dlqArn: !!dlqArn
		});
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
			body: JSON.stringify({ error: 'Missing galleryId' })
		};
	}

	const body = event?.body ? JSON.parse(event.body) : {};
	const expiresAt = body.expiresAt; // ISO string

	if (!expiresAt || typeof expiresAt !== 'string') {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'expiresAt (ISO string) is required' })
		};
	}

	// Validate expiresAt is a valid date
	const expiresAtDate = new Date(expiresAt);
	if (isNaN(expiresAtDate.getTime())) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Invalid expiresAt date format. Use ISO 8601 format.' })
		};
	}

	const requester = getUserIdFromEvent(event);
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

	requireOwnerOr403(gallery.ownerId, requester);

	try {
		// Cancel old schedule if it exists
		const oldScheduleName = gallery.expiryScheduleName || getScheduleName(galleryId);
		try {
			await cancelExpirySchedule(oldScheduleName);
			logger.info('Canceled old EventBridge schedule', { galleryId, oldScheduleName });
		} catch (cancelErr: any) {
			// Ignore if schedule doesn't exist
			if (cancelErr.name !== 'ResourceNotFoundException') {
				logger.warn('Failed to cancel old schedule', { error: cancelErr.message, galleryId });
			}
		}

		// Create new schedule
		const newScheduleName = await createExpirySchedule(
			galleryId,
			expiresAt,
			deletionLambdaArn,
			scheduleRoleArn,
			dlqArn
		);
		logger.info('Created new EventBridge schedule', { galleryId, scheduleName: newScheduleName, expiresAt });

		// Update gallery with new expiresAt and schedule name
		await ddb.send(new UpdateCommand({
			TableName: galleriesTable,
			Key: { galleryId },
			UpdateExpression: 'SET expiresAt = :e, expiryScheduleName = :sn, updatedAt = :u',
			ExpressionAttributeValues: {
				':e': expiresAt,
				':sn': newScheduleName,
				':u': new Date().toISOString()
			}
		}));

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				galleryId,
				expiresAt,
				scheduleName: newScheduleName,
				message: 'Gallery expiry date updated and EventBridge schedule created'
			})
		};
	} catch (error: any) {
		logger.error('Failed to set gallery expiry', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			galleryId,
			expiresAt
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				error: 'Failed to set gallery expiry',
				message: error.message
			})
		};
	}
});

