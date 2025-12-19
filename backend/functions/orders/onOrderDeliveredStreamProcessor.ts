import { lambdaLogger } from '../../../packages/logger/src';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({});

/**
 * Processes DynamoDB stream events
 * Filters for MODIFY events where deliveryStatus changes to DELIVERED
 * Extracts order details and invokes onOrderDelivered Lambda
 * 
 * This ensures final ZIP generation happens even if order is marked DELIVERED
 * outside of sendFinalLink/complete functions (e.g., direct DB update, admin action)
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const onOrderDeliveredFnName = envProc?.env?.ON_ORDER_DELIVERED_FN_NAME as string;
	
	if (!onOrderDeliveredFnName) {
		logger?.error('Missing ON_ORDER_DELIVERED_FN_NAME environment variable');
		return;
	}

	// Process all records in the batch
	const records = event.Records || [];
	const invocations: Promise<void>[] = [];

	for (const record of records) {
		try {
			// Only process MODIFY events (INSERT events won't have OldImage)
			if (record.eventName !== 'MODIFY') {
				continue;
			}

			const dynamodb = record.dynamodb;
			if (!dynamodb || !dynamodb.NewImage || !dynamodb.OldImage) {
				continue;
			}

			// Extract order details from DynamoDB stream record
			// DynamoDB stream format uses type descriptors (S for string, N for number, etc.)
			const newImage = dynamodb.NewImage;
			const oldImage = dynamodb.OldImage;
			
			const galleryId = newImage.galleryId?.S;
			const orderId = newImage.orderId?.S;
			const newDeliveryStatus = newImage.deliveryStatus?.S;
			const oldDeliveryStatus = oldImage.deliveryStatus?.S;

			if (!galleryId || !orderId) {
				logger?.warn('Missing galleryId or orderId in stream record', {
					galleryId,
					orderId,
					hasGalleryId: !!galleryId,
					hasOrderId: !!orderId
				});
				continue;
			}

			// Only trigger if deliveryStatus changed TO DELIVERED (not if it was already DELIVERED)
			if (newDeliveryStatus !== 'DELIVERED' || oldDeliveryStatus === 'DELIVERED') {
				continue;
			}

			// Check if finalZipGenerating is already set - if so, skip (explicit handler already triggered it)
			// This prevents duplicate invocations when sendFinalLink/complete explicitly invoke onOrderDelivered
			const finalZipGenerating = newImage.finalZipGenerating?.BOOL;
			if (finalZipGenerating === true) {
				logger?.info('Final ZIP generation already triggered (finalZipGenerating flag set), skipping', {
					galleryId,
					orderId,
					oldStatus: oldDeliveryStatus,
					newStatus: newDeliveryStatus
				});
				continue;
			}

			// Invoke onOrderDelivered Lambda asynchronously
			const payload = Buffer.from(JSON.stringify({ galleryId, orderId }));
			const invocation = lambda.send(new InvokeCommand({
				FunctionName: onOrderDeliveredFnName,
				Payload: payload,
				InvocationType: 'Event' // Async invocation
			})).then(() => {
				logger?.info('Triggered onOrderDelivered Lambda from stream event', {
					galleryId,
					orderId,
					fnName: onOrderDeliveredFnName,
					oldStatus: oldDeliveryStatus,
					newStatus: newDeliveryStatus
				});
			}).catch((err: any) => {
				logger?.error('Failed to invoke onOrderDelivered Lambda', {
					error: {
						name: err.name,
						message: err.message,
						stack: err.stack
					},
					galleryId,
					orderId,
					fnName: onOrderDeliveredFnName
				});
			});

			invocations.push(invocation);
		} catch (error: any) {
			logger?.error('Failed to process stream record', {
				error: {
					name: error.name,
					message: error.message,
					stack: error.stack
				},
				recordEventName: record.eventName
			});
		}
	}

	// Wait for all invocations to complete (but don't fail if some fail)
	await Promise.allSettled(invocations);
});

