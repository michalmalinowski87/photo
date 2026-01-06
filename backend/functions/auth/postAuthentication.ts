import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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

		// Extract email from Cognito user attributes
		const emailFromCognito = event.request?.userAttributes?.email || event.request?.userAttributes?.['email'] || '';

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

		// Preserve ALL existing fields first, then update only what needs to change
		// This prevents any data loss - we only update lastLoginAt, updatedAt, and email if needed
		const updateData: any = {
			...existingUser, // Preserve ALL existing fields
			userId,
			lastLoginAt: now,
			updatedAt: now
		};

		// Set createdAt for new users
		if (!existingUser.createdAt) {
			updateData.createdAt = now;
		}

		// Extract and store email from Cognito if not already set in DynamoDB
		// For new users, set email from Cognito attributes
		// For existing users, preserve existing email but update if Cognito has a different one
		if (emailFromCognito) {
			// If user doesn't have email in DynamoDB, or if Cognito email is different, update it
			if (!existingUser.email || existingUser.email !== emailFromCognito) {
				updateData.email = emailFromCognito.toLowerCase().trim();
				// Also set contactEmail if it's not set
				if (!existingUser.contactEmail) {
					updateData.contactEmail = emailFromCognito.toLowerCase().trim();
				}
			}
		}

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

		// Clear inactivity reminder flags on login so user can receive reminders again if they become inactive
		// This allows the reminders to be sent again if user becomes inactive in the future
		// Use separate UpdateCommand to remove the fields (PutCommand above preserves other fields)
		const fieldsToClear: string[] = [];
		if (existingUser.inactivityReminderSentAt) {
			fieldsToClear.push('inactivityReminderSentAt');
		}
		if (existingUser.inactivityFinalWarningSentAt) {
			fieldsToClear.push('inactivityFinalWarningSentAt');
		}
		
		if (fieldsToClear.length > 0) {
			try {
				// Remove fields unconditionally (safe - REMOVE is idempotent)
				await ddb.send(new UpdateCommand({
					TableName: usersTable,
					Key: { userId },
					UpdateExpression: `REMOVE ${fieldsToClear.join(', ')}`
				}));
				logger.debug('Cleared inactivity reminder flags on login', { 
					userId, 
					fieldsCleared: fieldsToClear 
				});
			} catch (updateErr: any) {
				// Ignore if update fails - not critical
				logger.debug('Could not clear inactivity reminder flags', { 
					userId,
					fields: fieldsToClear,
					error: updateErr.message 
				});
			}
		}

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

