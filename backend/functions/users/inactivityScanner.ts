import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createUserDeletionSchedule } from '../../lib/src/user-deletion-scheduler';
import { createInactivityReminderEmail, createInactivityFinalWarningEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const deletionLambdaArn = envProc?.env?.USER_DELETION_LAMBDA_ARN as string;
	const scheduleRoleArn = envProc?.env?.USER_DELETION_SCHEDULE_ROLE_ARN as string;
	const dlqArn = envProc?.env?.USER_DELETION_DLQ_ARN as string;
	const sender = envProc?.env?.SENDER_EMAIL as string;

	if (!usersTable) {
		logger.error('Missing USERS_TABLE configuration');
		return;
	}

	if (!sender) {
		logger.warn('Missing SENDER_EMAIL configuration - emails will not be sent');
	}

	const now = Date.now();
	const elevenMonthsAgo = now - (11 * 30 * 24 * 60 * 60 * 1000); // Approximate 11 months
	const twelveMonthsAgo = now - (12 * 30 * 24 * 60 * 60 * 1000); // Approximate 12 months
	const thirtyDaysFromNow = now + (30 * 24 * 60 * 60 * 1000); // 30 days from now

	logger.info('Starting inactivity scan', {
		now: new Date(now).toISOString(),
		elevenMonthsAgo: new Date(elevenMonthsAgo).toISOString(),
		twelveMonthsAgo: new Date(twelveMonthsAgo).toISOString()
	});

	try {
		// Scan all active users with lastLoginAt
		let lastEvaluatedKey: any = undefined;
		let usersProcessed = 0;
		let remindersSent = 0;
		let warningsSent = 0;
		let deletionsScheduled = 0;

		do {
			const scanParams: any = {
				TableName: usersTable,
				FilterExpression: '#status = :status AND attribute_exists(lastLoginAt)',
				ExpressionAttributeNames: {
					'#status': 'status'
				},
				ExpressionAttributeValues: {
					':status': 'active'
				},
				Limit: 100
			};

			if (lastEvaluatedKey) {
				scanParams.ExclusiveStartKey = lastEvaluatedKey;
			}

			const scanResult = await ddb.send(new ScanCommand(scanParams));
			const users = scanResult.Items || [];

			for (const user of users) {
				usersProcessed++;
				const userId = user.userId;
				const lastLoginAt = user.lastLoginAt;
				const userEmail = user.contactEmail || user.email;

				if (!lastLoginAt) {
					continue; // Skip users without lastLoginAt
				}

				const lastLoginTimestamp = new Date(lastLoginAt).getTime();
				const daysSinceLogin = Math.floor((now - lastLoginTimestamp) / (24 * 60 * 60 * 1000));

				// 11 months inactive: Send reminder
				if (lastLoginTimestamp < elevenMonthsAgo && lastLoginTimestamp >= twelveMonthsAgo) {
					if (sender && userEmail) {
						try {
							const daysUntilDeletion = Math.floor((twelveMonthsAgo + (30 * 24 * 60 * 60 * 1000) - now) / (24 * 60 * 60 * 1000));
							const emailTemplate = createInactivityReminderEmail(userEmail, daysUntilDeletion);
							
							await ses.send(new SendEmailCommand({
								Source: sender,
								Destination: { ToAddresses: [userEmail] },
								Message: {
									Subject: { Data: emailTemplate.subject },
									Body: {
										Text: { Data: emailTemplate.text },
										Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
									}
								}
							}));
							remindersSent++;
							logger.info('Sent inactivity reminder', { userId, daysSinceLogin });
						} catch (emailErr: any) {
							logger.error('Failed to send inactivity reminder', {
								error: emailErr.message,
								userId,
								email: userEmail
							});
						}
					}
				}

				// 12 months inactive: Send final warning + schedule deletion
				if (lastLoginTimestamp < twelveMonthsAgo) {
					// Check if already scheduled
					if (user.status === 'pendingDeletion' && user.deletionScheduledAt) {
						logger.info('User already scheduled for deletion', { userId, deletionScheduledAt: user.deletionScheduledAt });
						continue;
					}

					// Send final warning email
					if (sender && userEmail) {
						try {
							const deletionDate = new Date(thirtyDaysFromNow).toISOString();
							const emailTemplate = createInactivityFinalWarningEmail(userEmail, deletionDate);
							
							await ses.send(new SendEmailCommand({
								Source: sender,
								Destination: { ToAddresses: [userEmail] },
								Message: {
									Subject: { Data: emailTemplate.subject },
									Body: {
										Text: { Data: emailTemplate.text },
										Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
									}
								}
							}));
							warningsSent++;
							logger.info('Sent inactivity final warning', { userId, daysSinceLogin });
						} catch (emailErr: any) {
							logger.error('Failed to send inactivity final warning', {
								error: emailErr.message,
								userId,
								email: userEmail
							});
						}
					}

					// Schedule deletion for 30 days from now
					if (deletionLambdaArn && scheduleRoleArn) {
						try {
							const deletionScheduledAt = new Date(thirtyDaysFromNow).toISOString();
							
							// Update user status
							await ddb.send(new PutCommand({
								TableName: usersTable,
								Item: {
									...user,
									status: 'pendingDeletion',
									deletionScheduledAt,
									deletionReason: 'inactivity',
									deletionRequestedAt: new Date().toISOString(),
									updatedAt: new Date().toISOString()
								}
							}));

							// Create EventBridge schedule
							await createUserDeletionSchedule(userId, deletionScheduledAt, deletionLambdaArn, scheduleRoleArn, dlqArn);
							deletionsScheduled++;
							logger.info('Scheduled user deletion for inactivity', {
								userId,
								deletionScheduledAt,
								daysSinceLogin
							});
						} catch (scheduleErr: any) {
							logger.error('Failed to schedule user deletion', {
								error: scheduleErr.message,
								userId
							});
						}
					} else {
						logger.warn('EventBridge Scheduler not configured - cannot schedule deletion', {
							userId,
							hasDeletionLambdaArn: !!deletionLambdaArn,
							hasScheduleRoleArn: !!scheduleRoleArn
						});
					}
				}
			}

			lastEvaluatedKey = scanResult.LastEvaluatedKey;
		} while (lastEvaluatedKey);

		logger.info('Inactivity scan completed', {
			usersProcessed,
			remindersSent,
			warningsSent,
			deletionsScheduled
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				message: 'Inactivity scan completed',
				usersProcessed,
				remindersSent,
				warningsSent,
				deletionsScheduled
			})
		};
	} catch (error: any) {
		logger.error('Inactivity scan failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			}
		});
		throw error;
	}
});

