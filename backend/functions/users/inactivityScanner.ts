import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createUserDeletionSchedule } from '../../lib/src/user-deletion-scheduler';
import { createInactivityReminderEmail, createInactivityFinalWarningEmail } from '../../lib/src/email';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const deletionLambdaArn = envProc?.env?.USER_DELETION_LAMBDA_ARN as string;
	const scheduleRoleArn = envProc?.env?.USER_DELETION_SCHEDULE_ROLE_ARN as string;
	const dlqArn = envProc?.env?.USER_DELETION_DLQ_ARN as string;
	const stage = envProc?.env?.STAGE as string || 'dev';
	
	let sender: string;
	let dashboardUrl: string;
	let landingUrl: string;
	try {
		[sender, dashboardUrl, landingUrl] = await Promise.all([
			getRequiredConfigValue(stage, 'SenderEmail', { envVarName: 'SENDER_EMAIL' }),
			getRequiredConfigValue(stage, 'PublicDashboardUrl', { envVarName: 'PUBLIC_DASHBOARD_URL' }),
			getRequiredConfigValue(stage, 'PublicLandingUrl', { envVarName: 'PUBLIC_LANDING_URL' }),
		]);
	} catch (error: any) {
		logger.error('Missing configuration', { error: error.message, stage });
		throw error;
	}

	logger.debug('Configuration loaded', {
		stage,
		hasSenderEmail: !!sender,
		hasUsersTable: !!usersTable,
		hasDeletionLambdaArn: !!deletionLambdaArn,
		hasScheduleRoleArn: !!scheduleRoleArn
	});

	if (!usersTable) {
		logger.error('Missing USERS_TABLE configuration');
		return;
	}

	// sender is required; getRequiredConfigValue throws if missing

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
				FilterExpression: 'attribute_exists(lastLoginAt) AND (attribute_not_exists(#status) OR #status = :status)',
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

			logger.debug('Scanned users batch', {
				usersInBatch: users.length,
				hasMore: !!scanResult.LastEvaluatedKey
			});

			for (const user of users) {
				usersProcessed++;
				const userId = user.userId;
				const lastLoginAt = user.lastLoginAt;
				const userEmail = user.email;
				const userStatus = user.status || '(not set)';

				if (!lastLoginAt) {
					logger.debug('Skipping user without lastLoginAt', { userId, status: userStatus });
					continue; // Skip users without lastLoginAt
				}

				const lastLoginTimestamp = new Date(lastLoginAt).getTime();
				const daysSinceLogin = Math.floor((now - lastLoginTimestamp) / (24 * 60 * 60 * 1000));

				logger.debug('Processing user', {
					userId,
					lastLoginAt,
					status: userStatus,
					daysSinceLogin,
					lastLoginTimestamp: new Date(lastLoginTimestamp).toISOString(),
					elevenMonthsAgo: new Date(elevenMonthsAgo).toISOString(),
					twelveMonthsAgo: new Date(twelveMonthsAgo).toISOString(),
					matches11Month: lastLoginTimestamp < elevenMonthsAgo && lastLoginTimestamp >= twelveMonthsAgo,
					matches12Month: lastLoginTimestamp < twelveMonthsAgo,
					hasEmail: !!userEmail,
					hasSender: !!sender
				});

				// 11 months inactive: Send reminder (only if not already sent)
				if (lastLoginTimestamp < elevenMonthsAgo && lastLoginTimestamp >= twelveMonthsAgo) {
					// Check if reminder was already sent
					const reminderAlreadySent = user.inactivityReminderSentAt;
					
					if (reminderAlreadySent) {
						logger.debug('Inactivity reminder already sent, skipping', {
							userId,
							reminderSentAt: reminderAlreadySent,
							daysSinceLogin
						});
						continue;
					}

					logger.info('User matches 11-month reminder condition', {
						userId,
						lastLoginAt,
						daysSinceLogin,
						hasEmail: !!userEmail,
						hasSender: !!sender,
						reminderAlreadySent: !!reminderAlreadySent
					});
					
					if (sender && userEmail) {
						try {
							// User is at 11 months, they have 30 days grace period after hitting 12 months
							const daysUntilDeletion = 30;
							const loginUrl = `${dashboardUrl}/auth/sign-in`;
							const emailTemplate = createInactivityReminderEmail(userEmail, daysUntilDeletion, loginUrl, sender, landingUrl);
							
							// Send email first
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
							
							// Only mark as sent if email was successfully sent
							// Use conditional update to prevent race conditions (another Lambda might have set it)
							try {
								const nowIso = new Date().toISOString();
								await ddb.send(new UpdateCommand({
									TableName: usersTable,
									Key: { userId },
									UpdateExpression: 'SET inactivityReminderSentAt = :now, updatedAt = :now',
									ConditionExpression: 'attribute_not_exists(inactivityReminderSentAt)',
									ExpressionAttributeValues: {
										':now': nowIso
									}
								}));
								remindersSent++;
								logger.info('Sent inactivity reminder and marked as sent', { 
									userId, 
									daysSinceLogin, 
									email: userEmail 
								});
							} catch (updateErr: any) {
								// ConditionalCheckFailedException means another process already set it - this is OK
								if (updateErr.name === 'ConditionalCheckFailedException') {
									logger.info('Reminder flag already set by another process (duplicate prevented)', { 
										userId 
									});
									remindersSent++; // Count as sent since email was delivered
								} else {
									logger.warn('Failed to update inactivityReminderSentAt flag', {
										error: updateErr.message,
										userId
									});
									// Email was sent but flag wasn't set - will send again next time
									// This is acceptable as it's better to send duplicate than miss one
									remindersSent++;
								}
							}
						} catch (emailErr: any) {
							logger.error('Failed to send inactivity reminder', {
								error: emailErr.message,
								userId,
								email: userEmail
							});
							// Don't mark as sent if email failed
						}
					} else {
						logger.warn('Skipping 11-month reminder - missing sender or email', {
							userId,
							hasSender: !!sender,
							hasEmail: !!userEmail,
							email: userEmail
						});
					}
				}

				// 12 months inactive: Send final warning + schedule deletion
				if (lastLoginTimestamp < twelveMonthsAgo) {
					logger.info('User matches 12-month deletion condition', {
						userId,
						lastLoginAt,
						daysSinceLogin,
						status: userStatus,
						deletionScheduledAt: user.deletionScheduledAt,
						finalWarningSentAt: user.inactivityFinalWarningSentAt
					});
					
					// Check if already scheduled
					if (user.status === 'pendingDeletion' && user.deletionScheduledAt) {
						logger.info('User already scheduled for deletion', { userId, deletionScheduledAt: user.deletionScheduledAt });
						continue;
					}

					// Check if final warning email was already sent
					const finalWarningAlreadySent = user.inactivityFinalWarningSentAt;
					let finalWarningSentAtValue: string | undefined = user.inactivityFinalWarningSentAt;
					
					// Send final warning email (only if not already sent)
					if (sender && userEmail && !finalWarningAlreadySent) {
						try {
							const deletionDate = new Date(thirtyDaysFromNow).toISOString();
							const loginUrl = `${dashboardUrl}/auth/sign-in`;
							const emailTemplate = createInactivityFinalWarningEmail(userEmail, deletionDate, loginUrl, sender, landingUrl);
							
							// Send email first
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
							
							// Mark as sent using conditional update to prevent race conditions
							try {
								const nowIso = new Date().toISOString();
								await ddb.send(new UpdateCommand({
									TableName: usersTable,
									Key: { userId },
									UpdateExpression: 'SET inactivityFinalWarningSentAt = :now, updatedAt = :now',
									ConditionExpression: 'attribute_not_exists(inactivityFinalWarningSentAt)',
									ExpressionAttributeValues: {
										':now': nowIso
									}
								}));
								// Track that we successfully set the flag so we can preserve it in PutCommand below
								finalWarningSentAtValue = nowIso;
								warningsSent++;
								logger.info('Sent inactivity final warning and marked as sent', { userId, daysSinceLogin });
							} catch (updateErr: any) {
								// ConditionalCheckFailedException means another process already set it - this is OK
								if (updateErr.name === 'ConditionalCheckFailedException') {
									// Flag was already set by another process - read it from the user object (will be in DB)
									logger.info('Final warning flag already set by another process (duplicate prevented)', { userId });
									warningsSent++; // Count as sent since email was delivered
									// Note: finalWarningSentAtValue already has the value from user object
								} else {
									logger.warn('Failed to update inactivityFinalWarningSentAt flag', {
										error: updateErr.message,
										userId
									});
									// Email was sent but flag wasn't set - will send again next time
									// This is acceptable as it's better to send duplicate than miss one
									warningsSent++;
									// Don't preserve flag since it wasn't set
									finalWarningSentAtValue = undefined;
								}
							}
						} catch (emailErr: any) {
							logger.error('Failed to send inactivity final warning', {
								error: emailErr.message,
								userId,
								email: userEmail
							});
							// Don't mark as sent if email failed
							finalWarningSentAtValue = undefined;
						}
					} else if (finalWarningAlreadySent) {
						logger.debug('Final warning email already sent, skipping', {
							userId,
							finalWarningSentAt: finalWarningAlreadySent,
							daysSinceLogin
						});
					} else {
						logger.warn('Skipping 12-month final warning - missing sender or email', {
							userId,
							hasSender: !!sender,
							hasEmail: !!userEmail,
							email: userEmail
						});
					}

					// Schedule deletion for 30 days from now
					if (deletionLambdaArn && scheduleRoleArn) {
						try {
							const deletionScheduledAt = new Date(thirtyDaysFromNow).toISOString();
							const nowIso = new Date().toISOString();
							
							// Update user status to pendingDeletion
							// Preserve inactivityFinalWarningSentAt if it was set (either already existed or was just set above)
							await ddb.send(new PutCommand({
								TableName: usersTable,
								Item: {
									...user,
									status: 'pendingDeletion',
									deletionScheduledAt,
									deletionReason: 'inactivity',
									deletionRequestedAt: nowIso,
									updatedAt: nowIso,
									// Preserve inactivityFinalWarningSentAt if it exists or was just set
									...(finalWarningSentAtValue && { inactivityFinalWarningSentAt: finalWarningSentAtValue })
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

