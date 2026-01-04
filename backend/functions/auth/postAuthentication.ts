import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Cognito Post Authentication Trigger
 * Updates lastLoginAt in DynamoDB Users table on every successful login
 * 
 * Event structure from Cognito:
 * {
 *   "version": "1",
 *   "region": "us-east-1",
 *   "userPoolId": "us-east-1_XXXXXXXXX",
 *   "userName": "user-id-or-email",
 *   "triggerSource": "PostAuthentication_Authentication",
 *   "request": {
 *     "userAttributes": {
 *       "sub": "user-id",
 *       "email": "user@example.com",
 *       ...
 *     }
 *   },
 *   "response": {}
 * }
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	
	const usersTable = envProc?.env?.USERS_TABLE as string;

	if (!usersTable) {
		logger.error('Missing USERS_TABLE configuration');
		// Return event unchanged - don't break authentication flow
		return event;
	}

	try {
		// Extract userId from event
		// Cognito uses 'sub' as the user ID (userId in our system)
		const userId = event.request?.userAttributes?.sub || event.userName;
		
		if (!userId) {
			logger.warn('No userId found in Cognito event', { event });
			return event;
		}

		const now = new Date().toISOString();

		// Get existing user data to preserve fields
		let existingUser: any = {};
		try {
			const userResult = await ddb.send(new GetCommand({
				TableName: usersTable,
				Key: { userId }
			}));
			existingUser = userResult.Item || {};
		} catch (getErr: any) {
			logger.info('User record not found, will create new', { userId });
		}

		// Update lastLoginAt (preserve other fields)
		const updateData: any = {
			userId,
			lastLoginAt: now,
			updatedAt: now
		};

		// Preserve existing fields
		if (existingUser.createdAt) {
			updateData.createdAt = existingUser.createdAt;
		} else {
			updateData.createdAt = now;
		}

		// Preserve other fields if they exist
		if (existingUser.businessName !== undefined) updateData.businessName = existingUser.businessName;
		if (existingUser.contactEmail !== undefined) updateData.contactEmail = existingUser.contactEmail;
		if (existingUser.phone !== undefined) updateData.phone = existingUser.phone;
		if (existingUser.address !== undefined) updateData.address = existingUser.address;
		if (existingUser.nip !== undefined) updateData.nip = existingUser.nip;
		if (existingUser.status !== undefined) updateData.status = existingUser.status;
		if (existingUser.deletionScheduledAt !== undefined) updateData.deletionScheduledAt = existingUser.deletionScheduledAt;
		if (existingUser.deletionReason !== undefined) updateData.deletionReason = existingUser.deletionReason;

		// If user was pending deletion, cancel it on login
		if (existingUser.status === 'pendingDeletion' && existingUser.deletionReason === 'inactivity') {
			updateData.status = 'active';
			delete updateData.deletionScheduledAt;
			delete updateData.deletionReason;
			delete updateData.deletionRequestedAt;
			delete updateData.undoToken;
			
			logger.info('Cancelled inactivity deletion on login', { userId });
			
			// Cancel EventBridge schedule
			try {
				const { cancelUserDeletionSchedule } = await import('../../lib/src/user-deletion-scheduler');
				await cancelUserDeletionSchedule(userId);
				logger.info('Canceled user deletion schedule on login', { userId });
			} catch (scheduleErr: any) {
				logger.warn('Failed to cancel deletion schedule on login', {
					error: scheduleErr.message,
					userId
				});
				// Continue even if schedule cancellation fails
			}
		}

		await ddb.send(new PutCommand({
			TableName: usersTable,
			Item: updateData
		}));

		logger.info('Updated lastLoginAt', { userId, lastLoginAt: now });

		// Return event unchanged - Cognito expects the event back
		return event;
	} catch (error: any) {
		logger.error('Post authentication handler failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			}
		});
		// Return event unchanged - don't break authentication flow
		return event;
	}
});

