import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { createUserDeletionSchedule, cancelUserDeletionSchedule } from '../../lib/src/user-deletion-scheduler';
import { getConfigValueFromSsm } from '../../lib/src/ssm-config';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

/**
 * Dev endpoint to trigger user deletion immediately (skip 3-day wait)
 * Only available in development/staging environments
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stage = envProc?.env?.STAGE as string || 'dev';
	const usersTable = envProc?.env?.USERS_TABLE as string;
	
	// Read user deletion configuration from SSM Parameter Store with fallback to environment variables
	const [deletionLambdaArnFromSsm, scheduleRoleArnFromSsm, dlqArnFromSsm] = await Promise.all([
		getConfigValueFromSsm(stage, 'UserDeletionLambdaArn'),
		getConfigValueFromSsm(stage, 'UserDeletionScheduleRoleArn'),
		getConfigValueFromSsm(stage, 'UserDeletionDlqArn')
	]);
	
	const deletionLambdaArn = deletionLambdaArnFromSsm || envProc?.env?.USER_DELETION_LAMBDA_ARN as string;
	const deletionFnName = envProc?.env?.USER_DELETION_FN_NAME as string;
	const scheduleRoleArn = scheduleRoleArnFromSsm || envProc?.env?.USER_DELETION_SCHEDULE_ROLE_ARN as string;
	const dlqArn = dlqArnFromSsm || envProc?.env?.USER_DELETION_DLQ_ARN as string;

	// Only allow in dev/staging
	if (stage === 'prod') {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'This endpoint is not available in production' })
		};
	}

	if (!usersTable || !deletionLambdaArn) {
		logger.error('Missing required configuration', {
			hasUsersTable: !!usersTable,
			hasDeletionLambdaArn: !!deletionLambdaArn,
			deletionLambdaArnSource: deletionLambdaArnFromSsm ? 'SSM' : (envProc?.env?.USER_DELETION_LAMBDA_ARN ? 'ENV' : 'none')
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const userId = event?.pathParameters?.userId || getUserIdFromEvent(event);
	if (!userId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing userId' })
		};
	}

	const body = event?.body ? JSON.parse(event.body) : {};
	const immediate = body.immediate !== false; // Default to true, can be set to false to schedule normally
	const minutesFromNow = body.minutesFromNow || (immediate ? 1 : 0); // Default 1 minute if immediate

	// Get user
	const userResult = await ddb.send(new GetCommand({
		TableName: usersTable,
		Key: { userId }
	}));

	if (!userResult.Item) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'User not found' })
		};
	}

	const user = userResult.Item as any;

	// Calculate deletion time
	const deletionScheduledAt = new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
	const deletionTime = new Date(deletionScheduledAt);

	// Update user status
	const updateData: any = {
		...user,
		status: 'pendingDeletion',
		deletionScheduledAt,
		deletionReason: 'inactivity',
		deletionRequestedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};

	await ddb.send(new PutCommand({
		TableName: usersTable,
		Item: updateData
	}));

	// If immediate deletion (within 1 minute), update delivered galleries expiry to 15 minutes from deletion time
	if (immediate && minutesFromNow <= 1) {
		const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
		const ordersTable = envProc?.env?.ORDERS_TABLE as string;
		
		if (galleriesTable && ordersTable) {
			try {
				const newExpiryDate = new Date(deletionTime.getTime() + 15 * 60 * 1000); // 15 minutes from deletion time
				let galleriesUpdated = 0;
				let lastEvaluatedKey: any = undefined;

				do {
					// Query all galleries for this user
					const galleriesQuery = await ddb.send(new QueryCommand({
						TableName: galleriesTable,
						IndexName: 'ownerId-index',
						KeyConditionExpression: 'ownerId = :o',
						ExpressionAttributeValues: { ':o': userId },
						Limit: 100
					}));

					const galleries = galleriesQuery.Items || [];

					for (const gallery of galleries) {
						const galleryId = gallery.galleryId;

						// Check if gallery has any delivered orders
						let hasDeliveredOrders = false;
						try {
							// Try using GSI first
							try {
								const deliveredOrdersQuery = await ddb.send(new QueryCommand({
									TableName: ordersTable,
									IndexName: 'galleryId-deliveryStatus-index',
									KeyConditionExpression: 'galleryId = :g AND deliveryStatus = :ds',
									ExpressionAttributeValues: {
										':g': galleryId,
										':ds': 'DELIVERED'
									},
									Limit: 1 // Only need to know if at least one exists
								}));
								hasDeliveredOrders = (deliveredOrdersQuery.Items || []).length > 0;
							} catch (gsiErr: any) {
								// Fallback: Query all orders for gallery and filter
								const allOrdersQuery = await ddb.send(new QueryCommand({
									TableName: ordersTable,
									KeyConditionExpression: 'galleryId = :g',
									ExpressionAttributeValues: { ':g': galleryId },
									Limit: 100
								}));
								hasDeliveredOrders = (allOrdersQuery.Items || []).some((order: any) => 
									order.deliveryStatus === 'DELIVERED'
								);
							}
						} catch (ordersErr: any) {
							logger.warn('Failed to check delivered orders for gallery', {
								error: ordersErr.message,
								galleryId
							});
							// Skip this gallery if we can't check orders
							continue;
						}

						// If gallery has delivered orders, update expiry to 15 minutes from deletion time
						if (hasDeliveredOrders) {
							try {
								await ddb.send(new PutCommand({
									TableName: galleriesTable,
									Item: {
										...gallery,
										expiresAt: newExpiryDate.toISOString(),
										updatedAt: new Date().toISOString()
									}
								}));
								galleriesUpdated++;
								logger.info('Updated delivered gallery expiry for testing', {
									galleryId,
									userId,
									newExpiryDate: newExpiryDate.toISOString(),
									deletionTime: deletionTime.toISOString()
								});
							} catch (updateErr: any) {
								logger.warn('Failed to update gallery expiry', {
									error: updateErr.message,
									galleryId,
									userId
								});
							}
						}
					}

					lastEvaluatedKey = galleriesQuery.LastEvaluatedKey;
				} while (lastEvaluatedKey);

				if (galleriesUpdated > 0) {
					logger.info('Updated delivered galleries expiry for testing', {
						userId,
						galleriesUpdated,
						newExpiryDate: newExpiryDate.toISOString()
					});
				}
			} catch (galleriesErr: any) {
				logger.warn('Failed to update delivered galleries expiry', {
					error: galleriesErr.message,
					userId
				});
				// Don't fail the deletion trigger if gallery update fails
			}
		}
	}

	// Create EventBridge schedule (or invoke immediately)
	if (immediate && minutesFromNow <= 1) {
		// Invoke Lambda directly for immediate deletion
		try {
			// Use function name if available, otherwise extract from ARN
			let functionName = deletionFnName;
			if (!functionName && deletionLambdaArn) {
				// Extract function name from ARN: arn:aws:lambda:region:account:function:name
				if (deletionLambdaArn.includes(':function:')) {
					const parts = deletionLambdaArn.split(':function:');
					if (parts.length > 1) {
						// Remove any qualifier/version after the function name
						functionName = parts[1].split(':')[0].split('/').pop() || parts[1];
					}
				}
				if (!functionName) {
					functionName = deletionLambdaArn; // Fallback to ARN
				}
			}
			
			logger.info('Attempting to invoke deletion Lambda directly', {
				userId,
				functionName,
				deletionLambdaArn,
				deletionFnName,
				invocationType: 'Event'
			});
			
			await lambda.send(new InvokeCommand({
				FunctionName: functionName || deletionLambdaArn,
				InvocationType: 'Event', // Async invocation
				Payload: JSON.stringify({ userId })
			}));
			
			logger.info('Successfully invoked user deletion Lambda immediately', { 
				userId,
				functionName: functionName || deletionLambdaArn
			});
			
			// Also create a schedule as backup (in case async invocation fails silently)
			// This ensures deletion happens even if direct invocation has issues
			if (scheduleRoleArn) {
				try {
					await createUserDeletionSchedule(userId, deletionScheduledAt, deletionLambdaArn, scheduleRoleArn, dlqArn);
					logger.info('Created backup EventBridge schedule for immediate deletion', { 
						userId, 
						deletionScheduledAt 
					});
				} catch (scheduleErr: any) {
					logger.warn('Failed to create backup schedule (Lambda was invoked directly)', {
						error: scheduleErr.message,
						userId
					});
				}
			}
		} catch (lambdaErr: any) {
			logger.error('Failed to invoke deletion Lambda directly', {
				error: lambdaErr.message,
				errorName: lambdaErr.name,
				errorCode: lambdaErr.Code,
				userId,
				deletionLambdaArn,
				deletionFnName
			});
			// Fall back to scheduling
			if (scheduleRoleArn) {
				try {
					await createUserDeletionSchedule(userId, deletionScheduledAt, deletionLambdaArn, scheduleRoleArn, dlqArn);
					logger.info('Fell back to EventBridge schedule after Lambda invocation failed', { 
						userId, 
						deletionScheduledAt 
					});
				} catch (scheduleErr: any) {
					logger.error('Failed to create EventBridge schedule as fallback', {
						error: scheduleErr.message,
						userId
					});
					throw new Error(`Failed to trigger deletion: Lambda invocation failed (${lambdaErr.message}) and schedule creation failed (${scheduleErr.message})`);
				}
			} else {
				logger.error('Cannot fall back to scheduling - scheduleRoleArn not configured', { userId });
				throw new Error(`Failed to trigger deletion: Lambda invocation failed (${lambdaErr.message}) and no schedule role configured`);
			}
		}
	} else if (scheduleRoleArn) {
		// Create schedule
		try {
			await createUserDeletionSchedule(userId, deletionScheduledAt, deletionLambdaArn, scheduleRoleArn, dlqArn);
			logger.info('Created user deletion schedule', { userId, deletionScheduledAt });
		} catch (scheduleErr: any) {
			logger.error('Failed to create user deletion schedule', {
				error: scheduleErr.message,
				errorName: scheduleErr.name,
				userId,
				deletionScheduledAt
			});
			throw scheduleErr;
		}
	} else {
		logger.error('Cannot create deletion schedule - scheduleRoleArn not configured', { userId });
		throw new Error('Cannot schedule deletion: scheduleRoleArn not configured');
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			userId,
			deletionScheduledAt,
			immediate,
			message: immediate ? 'User deletion triggered immediately' : `User deletion scheduled for ${deletionScheduledAt}`
		})
	};
});

