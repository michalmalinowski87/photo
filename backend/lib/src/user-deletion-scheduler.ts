import { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand, GetScheduleCommand } from '@aws-sdk/client-scheduler';

const scheduler = new SchedulerClient({});

/**
 * Generates a deterministic schedule name for user deletion
 * Format: user-deletion-{userId}
 */
export function getUserDeletionScheduleName(userId: string): string {
	return `user-deletion-${userId}`;
}

/**
 * Creates an EventBridge schedule for user deletion
 * @param userId - User ID
 * @param deletionScheduledAt - ISO timestamp when user should be deleted
 * @param deletionLambdaArn - ARN of the Lambda function to invoke
 * @param scheduleRoleArn - IAM role ARN for EventBridge Scheduler to invoke Lambda
 * @param dlqArn - Optional Dead Letter Queue ARN for failed schedule executions
 * @returns The schedule name
 */
export async function createUserDeletionSchedule(
	userId: string,
	deletionScheduledAt: string,
	deletionLambdaArn: string,
	scheduleRoleArn: string,
	dlqArn?: string
): Promise<string> {
	const scheduleName = getUserDeletionScheduleName(userId);
	const deletionDate = new Date(deletionScheduledAt);
	
	// EventBridge Scheduler requires at least 1 minute in the future
	const now = new Date();
	const minScheduleTime = new Date(now.getTime() + 60 * 1000); // 1 minute from now
	
	// If deletion is in the past or less than 1 minute away, schedule for immediate execution (1 minute from now)
	const scheduleTime = deletionDate <= minScheduleTime ? minScheduleTime : deletionDate;
	
	// EventBridge Scheduler at() expression format: at(yyyy-mm-ddThh:mm:ss)
	// Format: Remove milliseconds and timezone indicator (EventBridge uses UTC by default)
	// Example: at(2025-12-12T19:09:00)
	const year = scheduleTime.getUTCFullYear();
	const month = String(scheduleTime.getUTCMonth() + 1).padStart(2, '0');
	const day = String(scheduleTime.getUTCDate()).padStart(2, '0');
	const hours = String(scheduleTime.getUTCHours()).padStart(2, '0');
	const minutes = String(scheduleTime.getUTCMinutes()).padStart(2, '0');
	const seconds = String(scheduleTime.getUTCSeconds()).padStart(2, '0');
	const scheduleExpression = `at(${year}-${month}-${day}T${hours}:${minutes}:${seconds})`;
	
	// Build schedule configuration (defined outside try block so it's accessible in catch)
	const scheduleConfig: any = {
		Name: scheduleName,
		ScheduleExpression: scheduleExpression,
		Target: {
			Arn: deletionLambdaArn,
			RoleArn: scheduleRoleArn,
			Input: JSON.stringify({
				userId
			})
		},
		FlexibleTimeWindow: {
			Mode: 'OFF' // Exact timing
		},
		Description: `User deletion schedule for ${userId}`,
		State: 'ENABLED'
	};
	
	// Add Dead Letter Queue configuration if provided
	if (dlqArn) {
		scheduleConfig.DeadLetterConfig = {
			Arn: dlqArn
		};
	}
	
	try {
		await scheduler.send(new CreateScheduleCommand(scheduleConfig));
		
		return scheduleName;
	} catch (error: any) {
		// If schedule already exists, update it instead
		if (error.name === 'ConflictException' || error.name === 'ResourceAlreadyExistsException') {
			// Delete existing schedule and create new one
			try {
				await scheduler.send(new DeleteScheduleCommand({ Name: scheduleName }));
				await scheduler.send(new CreateScheduleCommand(scheduleConfig));
				return scheduleName;
			} catch (updateErr: any) {
				throw updateErr;
			}
		}
		throw error;
	}
}

/**
 * Cancels an EventBridge schedule for user deletion
 * @param userId - User ID
 * @returns True if schedule was deleted, false if it didn't exist
 */
export async function cancelUserDeletionSchedule(userId: string): Promise<boolean> {
	const scheduleName = getUserDeletionScheduleName(userId);
	try {
		await scheduler.send(new DeleteScheduleCommand({
			Name: scheduleName
		}));
		return true;
	} catch (error: any) {
		// If schedule doesn't exist, that's okay - it means it was already deleted or never created
		if (error.name === 'ResourceNotFoundException') {
			return false;
		}
		throw error;
	}
}

/**
 * Checks if a user deletion schedule exists
 * @param userId - User ID
 * @returns True if schedule exists, false otherwise
 */
export async function userDeletionScheduleExists(userId: string): Promise<boolean> {
	const scheduleName = getUserDeletionScheduleName(userId);
	try {
		await scheduler.send(new GetScheduleCommand({
			Name: scheduleName
		}));
		return true;
	} catch (error: any) {
		if (error.name === 'ResourceNotFoundException') {
			return false;
		}
		throw error;
	}
}

