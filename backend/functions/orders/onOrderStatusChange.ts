import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
import { createHash } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

/**
 * Processes DynamoDB stream events for order status changes
 * Triggers ZIP generation for selected originals when:
 * 1. Status changes to CLIENT_APPROVED (from any status)
 * 2. Status changes to PREPARING_DELIVERY (only when coming from CHANGES_REQUESTED)
 * 
 * This ensures ZIP generation happens even if status changes outside of approveSelection function
 * (e.g., direct DB updates, admin actions, etc.)
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const zipFnName = envProc?.env?.DOWNLOADS_ZIP_FN_NAME as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	
	if (!zipFnName || !ordersTable || !bucket) {
		logger?.error('Missing required environment variables', {
			hasZipFnName: !!zipFnName,
			hasOrdersTable: !!ordersTable,
			hasBucket: !!bucket
		});
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
			// DynamoDB stream format uses type descriptors (S for string, SS for string set, etc.)
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

			// Check if status changed to CLIENT_APPROVED or PREPARING_DELIVERY
			const changedToClientApproved = newDeliveryStatus === 'CLIENT_APPROVED' && oldDeliveryStatus !== 'CLIENT_APPROVED';
			const changedToPreparingDelivery = newDeliveryStatus === 'PREPARING_DELIVERY' && oldDeliveryStatus === 'CHANGES_REQUESTED';

			if (!changedToClientApproved && !changedToPreparingDelivery) {
				continue;
			}

			// Check if zipGenerating is already set - if so, skip (approveSelection already triggered it)
			const zipGenerating = newImage.zipGenerating?.BOOL;
			if (zipGenerating === true) {
				logger?.info('ZIP generation already triggered (zipGenerating flag set), skipping', {
					galleryId,
					orderId,
					newDeliveryStatus,
					oldDeliveryStatus
				});
				continue;
			}

			// Fetch full order to get selectedKeys (stream record uses DynamoDB format, need DocumentClient format)
			// We need to fetch the order to get selectedKeys in a usable format
			let order: any;
			try {
				const orderGet = await ddb.send(new GetCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId }
				}));
				order = orderGet.Item;
			} catch (getErr: any) {
				logger?.error('Failed to fetch order for ZIP generation', {
					error: getErr.message,
					galleryId,
					orderId
				});
				continue;
			}

			if (!order) {
				logger?.warn('Order not found for ZIP generation', { galleryId, orderId });
				continue;
			}

			// Check if order has selectedKeys (should be an array)
			const selectedKeys = order.selectedKeys;
			if (!selectedKeys || !Array.isArray(selectedKeys) || selectedKeys.length === 0) {
				logger?.warn('Order has no selectedKeys, skipping ZIP generation', {
					galleryId,
					orderId,
					hasSelectedKeys: !!selectedKeys,
					selectedKeysType: typeof selectedKeys,
					selectedKeysLength: Array.isArray(selectedKeys) ? selectedKeys.length : 'not array'
				});
				continue;
			}

			// Compute hash of selectedKeys for ZIP validation
			// This matches the hash computation in approveSelection.ts
			let selectedKeysHash: string | undefined;
			try {
				// Hash is computed from selectedKeys array (sorted)
				const sortedKeys = [...selectedKeys].sort();
				selectedKeysHash = createHash('sha256')
					.update(JSON.stringify(sortedKeys))
					.digest('hex')
					.substring(0, 16); // Use first 16 chars for shorter hash
			} catch (hashErr: any) {
				logger?.error('Failed to compute selectedKeys hash', {
					error: hashErr.message,
					galleryId,
					orderId
				});
				// Continue without hash - ZIP generation will still work
			}

			// Set zipGenerating flag BEFORE invoking Lambda to prevent race conditions
			try {
				const updateExpr = selectedKeysHash
					? 'SET zipGenerating = :g, zipGeneratingSince = :ts, zipSelectedKeysHash = :h'
					: 'SET zipGenerating = :g, zipGeneratingSince = :ts';
				const updateValues: any = {
					':g': true,
					':ts': Date.now()
				};
				if (selectedKeysHash) {
					updateValues[':h'] = selectedKeysHash;
				}

				await ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: updateExpr,
					ExpressionAttributeValues: updateValues
				}));
			} catch (updateErr: any) {
				logger?.error('Failed to set zipGenerating flag', {
					error: updateErr.message,
					galleryId,
					orderId
				});
				continue;
			}

			// Invoke ZIP generation Lambda asynchronously
			const payload = Buffer.from(JSON.stringify({ 
				galleryId, 
				keys: selectedKeys, 
				orderId,
				selectedKeysHash // Pass hash to ZIP generation function
			}));

			const invocation = lambda.send(new InvokeCommand({
				FunctionName: zipFnName,
				Payload: payload,
				InvocationType: 'Event' // Async invocation
			})).then(() => {
				logger?.info('Triggered ZIP generation Lambda from stream event', {
					galleryId,
					orderId,
					fnName: zipFnName,
					oldStatus: oldDeliveryStatus,
					newStatus: newDeliveryStatus,
					selectedKeysCount: selectedKeys.length,
					hasHash: !!selectedKeysHash
				});
			}).catch((err: any) => {
				logger?.error('Failed to invoke ZIP generation Lambda', {
					error: {
						name: err.name,
						message: err.message,
						stack: err.stack
					},
					galleryId,
					orderId,
					fnName: zipFnName
				});
				// Clear the flag if Lambda invocation failed
				ddb.send(new UpdateCommand({
					TableName: ordersTable,
					Key: { galleryId, orderId },
					UpdateExpression: 'REMOVE zipGenerating, zipGeneratingSince, zipSelectedKeysHash'
				})).catch((clearErr: any) => {
					logger?.warn('Failed to clear zipGenerating flag after Lambda invocation failure', {
						error: clearErr.message,
						galleryId,
						orderId
					});
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

