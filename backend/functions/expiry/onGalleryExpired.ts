import { lambdaLogger } from '../../../packages/logger/src';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({});

/**
 * @deprecated This Lambda is no longer used. Gallery expiration is now handled by EventBridge Scheduler.
 * 
 * Previously: Lambda triggered by DynamoDB Streams when TTL expires and deletes a gallery
 * This handled cleanup of S3 objects and related resources
 * 
 * DynamoDB TTL automatically deleted items when ttl attribute expired (typically within 48 hours)
 * This stream handler was triggered immediately when deletion occurred
 * 
 * Migration: All galleries now use EventBridge Scheduler for precise expiration timing.
 * The DynamoDB Stream infrastructure has been removed.
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const deleteFnName = envProc?.env?.GALLERIES_DELETE_FN_NAME as string;
	
	if (!deleteFnName) {
		logger.error('GALLERIES_DELETE_FN_NAME not configured');
		return;
	}

	logger.info('Processing DynamoDB Stream events for expired galleries', { recordCount: event.Records.length });

	for (const record of event.Records) {
		// Only process REMOVE events (TTL deletions)
		if (record.eventName !== 'REMOVE') {
			continue;
		}

		// Get galleryId from old image (before deletion)
		const oldImage = record.dynamodb?.OldImage;
		if (!oldImage) {
			logger.warn('Stream record missing OldImage', { eventID: record.eventID });
			continue;
		}

		// Extract galleryId from DynamoDB format
		const galleryId = oldImage.galleryId?.S || oldImage.galleryId;
		if (!galleryId) {
			logger.warn('Stream record missing galleryId', { eventID: record.eventID });
			continue;
		}

		logger.info('Gallery expired via TTL, triggering cleanup', { galleryId, eventID: record.eventID });

		// Invoke delete gallery Lambda to clean up S3 objects and related resources
		// This Lambda already handles all cleanup logic
		try {
			await lambda.send(new InvokeCommand({
				FunctionName: deleteFnName,
				InvocationType: 'Event', // Async invocation
				Payload: Buffer.from(JSON.stringify({
					pathParameters: { id: galleryId }
					// No requester - this is automatic expiry deletion
				}))
			}));
			logger.info('Delete gallery lambda invoked for expired gallery', { galleryId });
		} catch (invokeErr: any) {
			logger.error('Failed to invoke delete gallery lambda', {
				error: invokeErr.message,
				galleryId,
				deleteFnName
			});
		}
	}
});

