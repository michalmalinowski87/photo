import { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand, GetScheduleCommand, UpdateScheduleCommand } from '@aws-sdk/client-scheduler';

// Logger type and factory - imported dynamically to avoid TypeScript path issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loggerModule = require('../../../packages/logger/src');
const createLogger = loggerModule.createLogger;
type Logger = typeof loggerModule.Logger extends (infer T) ? T : any;

const scheduler = new SchedulerClient({});

/**
 * Generates a deterministic schedule name for a gallery
 * Format: gallery-expiry-{galleryId}
 */
export function getScheduleName(galleryId: string): string {
	return `gallery-expiry-${galleryId}`;
}

/**
 * Creates an EventBridge schedule for gallery expiration
 * @param galleryId - Gallery ID
 * @param expiresAt - ISO timestamp when gallery expires
 * @param deletionLambdaArn - ARN of the Lambda function to invoke
 * @param scheduleRoleArn - IAM role ARN for EventBridge Scheduler to invoke Lambda
 * @param dlqArn - Optional Dead Letter Queue ARN for failed schedule executions
 * @param logger - Optional logger instance for structured logging
 * @returns The schedule name
 */
export async function createExpirySchedule(
	galleryId: string,
	expiresAt: string,
	deletionLambdaArn: string,
	scheduleRoleArn: string,
	dlqArn?: string,
	logger?: Logger
): Promise<string> {
	const log = logger || createLogger({ component: 'expiry-scheduler' });
	const scheduleName = getScheduleName(galleryId);
	const expiresAtDate = new Date(expiresAt);
	
	// EventBridge Scheduler requires at least 1 minute in the future
	const now = new Date();
	const minScheduleTime = new Date(now.getTime() + 60 * 1000); // 1 minute from now
	
	// If expiry is in the past or less than 1 minute away, schedule for immediate execution (1 minute from now)
	const scheduleTime = expiresAtDate <= minScheduleTime ? minScheduleTime : expiresAtDate;
	
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
	
	log.info('Creating expiry schedule', {
		galleryId,
		scheduleName,
		expiresAt,
		scheduleTime: scheduleTime.toISOString(),
		scheduleExpression,
		hasDlq: !!dlqArn
	});
	
	try {
		const scheduleConfig: any = {
			Name: scheduleName,
			ScheduleExpression: scheduleExpression,
			Target: {
				Arn: deletionLambdaArn,
				RoleArn: scheduleRoleArn,
				Input: JSON.stringify({
					galleryId
				})
			},
			FlexibleTimeWindow: {
				Mode: 'OFF' // Exact timing
			},
			Description: `Gallery expiration schedule for ${galleryId}`,
			State: 'ENABLED'
		};
		
		// Add Dead Letter Queue configuration if provided
		if (dlqArn) {
			scheduleConfig.DeadLetterConfig = {
				Arn: dlqArn
			};
		}
		
		await scheduler.send(new CreateScheduleCommand(scheduleConfig));
		
		log.info('Expiry schedule created successfully', { galleryId, scheduleName });
		return scheduleName;
	} catch (error: any) {
		// If schedule already exists, that's okay - it means it was already created
		if (error.name === 'ConflictException' || error.name === 'ResourceAlreadyExistsException') {
			log.info('Expiry schedule already exists', { galleryId, scheduleName });
			return scheduleName;
		}
		log.error('Failed to create expiry schedule', {
			galleryId,
			scheduleName,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		throw error;
	}
}

/**
 * Cancels an EventBridge schedule for gallery expiration
 * @param scheduleName - Schedule name to cancel
 * @param logger - Optional logger instance for structured logging
 * @returns True if schedule was deleted, false if it didn't exist
 */
export async function cancelExpirySchedule(scheduleName: string, logger?: Logger): Promise<boolean> {
	const log = logger || createLogger({ component: 'expiry-scheduler' });
	
	log.info('Cancelling expiry schedule', { scheduleName });
	
	try {
		await scheduler.send(new DeleteScheduleCommand({
			Name: scheduleName
		}));
		log.info('Expiry schedule cancelled successfully', { scheduleName });
		return true;
	} catch (error: any) {
		// If schedule doesn't exist, that's okay - it means it was already deleted or never created
		if (error.name === 'ResourceNotFoundException') {
			log.info('Expiry schedule not found (already deleted or never created)', { scheduleName });
			return false;
		}
		log.error('Failed to cancel expiry schedule', {
			scheduleName,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		throw error;
	}
}

/**
 * Updates an existing EventBridge schedule for gallery expiration
 * @param galleryId - Gallery ID
 * @param expiresAt - ISO timestamp when gallery expires
 * @param deletionLambdaArn - ARN of the Lambda function to invoke
 * @param scheduleRoleArn - IAM role ARN for EventBridge Scheduler to invoke Lambda
 * @param dlqArn - Optional Dead Letter Queue ARN for failed schedule executions
 * @param logger - Optional logger instance for structured logging
 * @returns The schedule name
 */
export async function updateExpirySchedule(
	galleryId: string,
	expiresAt: string,
	deletionLambdaArn: string,
	scheduleRoleArn: string,
	dlqArn?: string,
	logger?: Logger
): Promise<string> {
	const log = logger || createLogger({ component: 'expiry-scheduler' });
	const scheduleName = getScheduleName(galleryId);
	const expiresAtDate = new Date(expiresAt);
	
	// EventBridge Scheduler requires at least 1 minute in the future
	const now = new Date();
	const minScheduleTime = new Date(now.getTime() + 60 * 1000); // 1 minute from now
	
	// If expiry is in the past or less than 1 minute away, schedule for immediate execution (1 minute from now)
	const scheduleTime = expiresAtDate <= minScheduleTime ? minScheduleTime : expiresAtDate;
	
	// EventBridge Scheduler at() expression format: at(yyyy-mm-ddThh:mm:ss)
	const year = scheduleTime.getUTCFullYear();
	const month = String(scheduleTime.getUTCMonth() + 1).padStart(2, '0');
	const day = String(scheduleTime.getUTCDate()).padStart(2, '0');
	const hours = String(scheduleTime.getUTCHours()).padStart(2, '0');
	const minutes = String(scheduleTime.getUTCMinutes()).padStart(2, '0');
	const seconds = String(scheduleTime.getUTCSeconds()).padStart(2, '0');
	const scheduleExpression = `at(${year}-${month}-${day}T${hours}:${minutes}:${seconds})`;
	
	log.info('Updating expiry schedule', {
		galleryId,
		scheduleName,
		expiresAt,
		scheduleTime: scheduleTime.toISOString(),
		scheduleExpression
	});
	
	try {
		const scheduleConfig: any = {
			Name: scheduleName,
			ScheduleExpression: scheduleExpression,
			Target: {
				Arn: deletionLambdaArn,
				RoleArn: scheduleRoleArn,
				Input: JSON.stringify({
					galleryId
				})
			},
			FlexibleTimeWindow: {
				Mode: 'OFF' // Exact timing
			},
			Description: `Gallery expiration schedule for ${galleryId}`,
			State: 'ENABLED'
		};
		
		// Add Dead Letter Queue configuration if provided
		if (dlqArn) {
			scheduleConfig.DeadLetterConfig = {
				Arn: dlqArn
			};
		}
		
		await scheduler.send(new UpdateScheduleCommand(scheduleConfig));
		
		log.info('Expiry schedule updated successfully', { galleryId, scheduleName });
		return scheduleName;
	} catch (error: any) {
		// If schedule doesn't exist, create it instead
		if (error.name === 'ResourceNotFoundException') {
			log.info('Schedule not found, creating new schedule', { galleryId, scheduleName });
			return createExpirySchedule(galleryId, expiresAt, deletionLambdaArn, scheduleRoleArn, dlqArn, log);
		}
		log.error('Failed to update expiry schedule', {
			galleryId,
			scheduleName,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		throw error;
	}
}

/**
 * Gets schedule details including state and execution time
 * @param scheduleName - Schedule name to check
 * @param logger - Optional logger instance for structured logging
 * @returns Schedule details or null if not found
 */
export async function getSchedule(scheduleName: string, logger?: Logger): Promise<any | null> {
	const log = logger || createLogger({ component: 'expiry-scheduler' });
	
	try {
		const result = await scheduler.send(new GetScheduleCommand({
			Name: scheduleName
		}));
		log.debug('Retrieved schedule details', { scheduleName, state: result.State });
		return result;
	} catch (error: any) {
		if (error.name === 'ResourceNotFoundException') {
			log.debug('Schedule not found', { scheduleName });
			return null;
		}
		log.error('Failed to get schedule', {
			scheduleName,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		throw error;
	}
}

/**
 * Checks if a schedule exists
 * @param scheduleName - Schedule name to check
 * @param logger - Optional logger instance for structured logging
 * @returns True if schedule exists, false otherwise
 */
export async function scheduleExists(scheduleName: string, logger?: Logger): Promise<boolean> {
	const schedule = await getSchedule(scheduleName, logger);
	return schedule !== null;
}

