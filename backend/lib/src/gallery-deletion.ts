import { DynamoDBDocumentClient, GetCommand, DeleteCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
import { cancelExpirySchedule, getScheduleName } from './expiry-scheduler';
import { getUnpaidTransactionForGallery, updateTransactionStatus } from './transactions';
import { createGalleryDeletedEmail, createGalleryDeletedEmailForOwner } from './email';

/**
 * Gets owner email from gallery or Cognito
 */
async function getOwnerEmail(
	gallery: any,
	userPoolId: string | undefined,
	cognito: any,
	logger: any
): Promise<string | undefined> {
	if (gallery.ownerEmail) {
		return gallery.ownerEmail;
	}

	if (userPoolId && gallery.ownerId) {
		try {
			const cognitoResponse = await cognito.send(new AdminGetUserCommand({
				UserPoolId: userPoolId,
				Username: gallery.ownerId
			}));
			const emailAttr = cognitoResponse.UserAttributes?.find((attr: any) => attr.Name === 'email');
			if (emailAttr?.Value) {
				return emailAttr.Value;
			}
		} catch (err: any) {
			logger.warn('Failed to get owner email from Cognito', {
				error: err.message,
				galleryId: gallery.galleryId,
				ownerId: gallery.ownerId
			});
		}
	}

	return undefined;
}

/**
 * Batch deletes S3 objects under a prefix
 * Uses DeleteObjects API for efficient batch deletion (up to 1,000 objects per call)
 * Processes deletions in parallel batches for better performance
 */
async function deleteS3Prefix(
	bucket: string,
	prefix: string,
	s3: S3Client,
	logger?: any
): Promise<number> {
	let continuationToken: string | undefined;
	let totalDeleted = 0;
	const startTime = Date.now();
	const MAX_EXECUTION_TIME_MS = 14 * 60 * 1000; // 14 minutes (leave 1 min buffer before Lambda timeout)
	
	do {
		// Check if we're approaching timeout
		const elapsed = Date.now() - startTime;
		if (elapsed > MAX_EXECUTION_TIME_MS) {
			if (logger) {
				logger.warn('Approaching Lambda timeout, stopping S3 deletion', {
					prefix,
					totalDeleted,
					elapsedMs: elapsed
				});
			}
			break;
		}
		
		// List objects
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			ContinuationToken: continuationToken,
			MaxKeys: 1000 // Get up to 1,000 keys per list call
		}));

		if (listResponse.Contents && listResponse.Contents.length > 0) {
			// Process deletions in parallel batches for better performance
			// Delete up to 5 batches of 1,000 objects in parallel
			const BATCH_SIZE = 1000;
			const PARALLEL_BATCHES = 5;
			const chunks: any[][] = [];
			
			for (let i = 0; i < listResponse.Contents.length; i += BATCH_SIZE) {
				chunks.push(listResponse.Contents.slice(i, i + BATCH_SIZE));
			}

			// Process chunks in parallel batches
			for (let i = 0; i < chunks.length; i += PARALLEL_BATCHES) {
				const parallelChunks = chunks.slice(i, i + PARALLEL_BATCHES);
				
				const deletePromises = parallelChunks.map(chunk => {
					const objectsToDelete = chunk.map(obj => ({ Key: obj.Key! }));
					
					return s3.send(new DeleteObjectsCommand({
						Bucket: bucket,
						Delete: {
							Objects: objectsToDelete,
							Quiet: true
						}
					})).then(deleteResponse => {
						const deletedCount = deleteResponse.Deleted?.length || 0;
						
						// Log any errors from batch delete
						if (deleteResponse.Errors && deleteResponse.Errors.length > 0 && logger) {
							logger.warn('Some S3 objects failed to delete', {
								errors: deleteResponse.Errors,
								prefix,
								chunkSize: chunk.length
							});
						}
						
						return deletedCount;
					}).catch(deleteErr => {
						if (logger) {
							logger.error('Failed to batch delete S3 objects', {
								error: deleteErr.message,
								prefix,
								chunkSize: chunk.length
							});
						}
						return 0; // Return 0 on error, continue with other chunks
					});
				});
				
				const results = await Promise.all(deletePromises);
				totalDeleted += results.reduce((sum, count) => sum + count, 0);
				
				// Check timeout again after each parallel batch
				const elapsedAfterBatch = Date.now() - startTime;
				if (elapsedAfterBatch > MAX_EXECUTION_TIME_MS) {
					if (logger) {
						logger.warn('Approaching Lambda timeout after parallel batch, stopping S3 deletion', {
							prefix,
							totalDeleted,
							elapsedMs: elapsedAfterBatch
						});
					}
					break;
				}
			}
		}

		continuationToken = listResponse.NextContinuationToken;
	} while (continuationToken);

	return totalDeleted;
}

/**
 * Deletes all image metadata from DynamoDB for a gallery
 */
async function deleteImageMetadata(
	galleryId: string,
	imagesTable: string,
	ddb: DynamoDBDocumentClient,
	logger: any
): Promise<number> {
	logger.info('Starting DynamoDB image metadata deletion for gallery', { galleryId });
	
	let totalDeleted = 0;
	let lastEvaluatedKey: any = undefined;
	
	do {
		// Query all images for this gallery
		const queryParams: any = {
			TableName: imagesTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: {
				':g': galleryId
			},
			Limit: 1000
		};

		if (lastEvaluatedKey) {
			queryParams.ExclusiveStartKey = lastEvaluatedKey;
		}

		const queryResponse = await ddb.send(new QueryCommand(queryParams));
		const imageRecords = queryResponse.Items || [];
		
		if (imageRecords.length > 0) {
			// Delete in batches of 25 (DynamoDB transaction limit)
			for (let i = 0; i < imageRecords.length; i += 25) {
				const batch = imageRecords.slice(i, i + 25);
				const transactItems = batch.map(record => ({
					Delete: {
						TableName: imagesTable,
						Key: { galleryId, imageKey: record.imageKey }
					}
				}));

				try {
					await ddb.send(new TransactWriteCommand({
						TransactItems: transactItems
					}));
					totalDeleted += batch.length;
				} catch (transactErr: any) {
					logger.error('Failed to delete image metadata batch from DynamoDB', {
						error: transactErr.message,
						galleryId,
						batchIndex: i
					});
					// Continue with other batches even if one fails
				}
			}
		}
		
		lastEvaluatedKey = queryResponse.LastEvaluatedKey;
	} while (lastEvaluatedKey);
	
	logger.info('Completed DynamoDB image metadata deletion for gallery', { 
		galleryId, 
		totalDeleted
	});

	return totalDeleted;
}

/**
 * Deletes all orders for a gallery
 */
async function deleteOrders(
	galleryId: string,
	ordersTable: string,
	ddb: DynamoDBDocumentClient,
	logger: any
): Promise<number> {
	try {
		const ordersQuery = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: { ':g': galleryId }
		}));
		
		await Promise.allSettled(
			(ordersQuery.Items || []).map(item =>
				ddb.send(new DeleteCommand({
					TableName: ordersTable,
					Key: { galleryId: item.galleryId, orderId: item.orderId }
				}))
			)
		);
		const count = (ordersQuery.Items || []).length;
		logger.info('Deleted orders', { galleryId, count });
		return count;
	} catch (err: any) {
		logger.error('Failed to delete orders', { error: err.message, galleryId });
		return 0;
	}
}

/**
 * Sends deletion confirmation emails to owner and client
 */
async function sendDeletionEmails(
	galleryId: string,
	galleryName: string | undefined,
	ownerEmail: string | undefined,
	clientEmail: string | undefined,
	sender: string,
	ses: any,
	s3ObjectsDeleted: number,
	logger: any
): Promise<void> {
	if (!sender) {
		return;
	}

	const deletionSummary = { s3ObjectsDeleted };
	const ownerTemplate = createGalleryDeletedEmailForOwner(galleryId, galleryName || galleryId, deletionSummary);
	const clientTemplate = createGalleryDeletedEmail(galleryId, galleryName || galleryId, deletionSummary);

	// Send to photographer (owner-oriented copy)
	if (ownerEmail) {
		try {
			await ses.send(new SendEmailCommand({
				Source: sender,
				Destination: { ToAddresses: [ownerEmail] },
				Message: {
					Subject: { Data: ownerTemplate.subject },
					Body: {
						Text: { Data: ownerTemplate.text },
						Html: ownerTemplate.html ? { Data: ownerTemplate.html } : undefined
					}
				}
			}));
			logger.info('Deletion confirmation email sent to photographer', { ownerEmail, galleryId });
		} catch (emailErr: any) {
			logger.warn('Failed to send deletion email to photographer', {
				error: emailErr.message,
				ownerEmail,
				galleryId
			});
		}
	}

	// Send to client (client-oriented copy)
	if (clientEmail) {
		try {
			await ses.send(new SendEmailCommand({
				Source: sender,
				Destination: { ToAddresses: [clientEmail] },
				Message: {
					Subject: { Data: clientTemplate.subject },
					Body: {
						Text: { Data: clientTemplate.text },
						Html: clientTemplate.html ? { Data: clientTemplate.html } : undefined
					}
				}
			}));
			logger.info('Deletion confirmation email sent to client', { clientEmail, galleryId });
		} catch (emailErr: any) {
			logger.warn('Failed to send deletion email to client', {
				error: emailErr.message,
				clientEmail,
				galleryId
			});
		}
	}
}

export interface DeleteGalleryOptions {
	/**
	 * Whether to validate expiry before deletion (for expiry-triggered deletions)
	 */
	validateExpiry?: boolean;
	/**
	 * Whether to send deletion confirmation emails
	 */
	sendEmails?: boolean;
}

export interface DeleteGalleryResult {
	galleryId: string;
	s3ObjectsDeleted: number;
	imageMetadataDeleted: number;
	ordersDeleted: number;
}

/**
 * Core function to delete a gallery and all related resources
 * This function handles:
 * - Canceling EventBridge schedule
 * - Canceling unpaid transactions
 * - Deleting image metadata from DynamoDB
 * - Deleting S3 objects
 * - Deleting orders
 * - Deleting the gallery itself
 * - Sending confirmation emails
 */
export async function deleteGallery(
	gallery: any,
	config: {
		galleriesTable: string;
		ordersTable?: string;
		imagesTable?: string;
		bucket: string;
		transactionsTable?: string;
		userPoolId?: string;
		sender?: string;
	},
	clients: {
		ddb: DynamoDBDocumentClient;
		s3: S3Client;
		ses: any;
		cognito: any;
	},
	logger: any,
	options: DeleteGalleryOptions = {}
): Promise<DeleteGalleryResult> {
	const {
		validateExpiry = false,
		sendEmails = true
	} = options;

	const galleryId = gallery.galleryId;
	const galleryName = gallery.galleryName;
	const clientEmail = gallery.clientEmail;

	logger.info('Starting gallery deletion', { galleryId, ownerId: gallery.ownerId });

	// Validate expiry if requested (for expiry-triggered deletions)
	if (validateExpiry) {
		const expiresAt = gallery.expiresAt;
		if (!expiresAt) {
			logger.warn('Gallery has no expiresAt - skipping deletion', { galleryId });
			throw new Error('Gallery has no expiresAt');
		}

		const expiresAtDate = new Date(expiresAt);
		const now = new Date();
		
		// Allow 1-hour buffer for flexible timing (as per plan requirements)
		const bufferMs = 60 * 60 * 1000; // 1 hour
		if (expiresAtDate.getTime() > now.getTime() + bufferMs) {
			logger.info('Gallery not yet expired - may have been extended', {
				galleryId,
				expiresAt,
				now: now.toISOString(),
				hoursUntilExpiry: (expiresAtDate.getTime() - now.getTime()) / (1000 * 60 * 60)
			});
			throw new Error('Gallery not yet expired');
		}

		logger.info('Gallery expired, starting deletion', {
			galleryId,
			expiresAt,
			expiredHoursAgo: (now.getTime() - expiresAtDate.getTime()) / (1000 * 60 * 60)
		});
	}

	// Get owner email before deletion
	const ownerEmail = await getOwnerEmail(gallery, config.userPoolId, clients.cognito, logger);

	// 1. Cancel EventBridge schedule if it exists (idempotent - won't fail if doesn't exist)
	const scheduleName = gallery.expiryScheduleName || getScheduleName(galleryId);
	try {
		await cancelExpirySchedule(scheduleName);
		logger.info('Canceled EventBridge schedule for gallery', { galleryId, scheduleName });
	} catch (scheduleErr: any) {
		logger.warn('Failed to cancel EventBridge schedule (may not exist)', {
			error: scheduleErr.message,
			galleryId,
			scheduleName
		});
		// Continue with deletion even if schedule cancellation fails
	}

	// 2. Cancel any unpaid transactions for this gallery before deletion
	if (config.transactionsTable) {
		try {
			const unpaidTransaction = await getUnpaidTransactionForGallery(galleryId);
			if (unpaidTransaction) {
				await updateTransactionStatus(unpaidTransaction.userId, unpaidTransaction.transactionId, 'CANCELED');
				logger.info('Canceled unpaid transaction before gallery deletion', {
					transactionId: unpaidTransaction.transactionId,
					galleryId,
					userId: unpaidTransaction.userId
				});
			}
		} catch (txnErr: any) {
			logger.warn('Failed to cancel transaction before gallery deletion', {
				error: txnErr.message,
				galleryId
			});
			// Continue with deletion even if transaction cancellation fails
		}
	}

	// 3. Delete all image metadata from DynamoDB first
	let imageMetadataDeleted = 0;
	if (config.imagesTable) {
		try {
			imageMetadataDeleted = await deleteImageMetadata(galleryId, config.imagesTable, clients.ddb, logger);
		} catch (err: any) {
			logger.error('Failed to delete image metadata', { error: err.message, galleryId });
			// Continue with deletion even if image metadata deletion fails
		}
	}

	// 4. Delete all S3 objects for this gallery
	const galleryPrefix = `galleries/${galleryId}/`;
	const deletionStartTime = Date.now();
	const s3ObjectsDeleted = await deleteS3Prefix(config.bucket, galleryPrefix, clients.s3, logger);
	const deletionDuration = Date.now() - deletionStartTime;
	
	logger.info('Deleted S3 objects', { 
		galleryId, 
		count: s3ObjectsDeleted,
		durationMs: deletionDuration,
		durationSeconds: Math.round(deletionDuration / 1000)
	});
	
	// If deletion took a very long time, log a warning
	if (deletionDuration > 10 * 60 * 1000) { // > 10 minutes
		logger.warn('S3 deletion took longer than 10 minutes - consider Step Functions for very large galleries', {
			galleryId,
			durationSeconds: Math.round(deletionDuration / 1000),
			objectsDeleted: s3ObjectsDeleted
		});
	}

	// 5. Delete all orders for this gallery
	let ordersDeleted = 0;
	if (config.ordersTable) {
		ordersDeleted = await deleteOrders(galleryId, config.ordersTable, clients.ddb, logger);
	}

	// 6. Finally, delete the gallery itself
	await clients.ddb.send(new DeleteCommand({
		TableName: config.galleriesTable,
		Key: { galleryId }
	}));
	logger.info('Deleted gallery from DynamoDB', { galleryId });

	// 7. Send confirmation emails
	if (sendEmails && config.sender) {
		await sendDeletionEmails(
			galleryId,
			galleryName,
			ownerEmail,
			clientEmail,
			config.sender,
			clients.ses,
			s3ObjectsDeleted,
			logger
		);
	}

	logger.info('Gallery deletion completed', {
		galleryId,
		s3ObjectsDeleted,
		imageMetadataDeleted,
		ordersDeleted
	});

	return {
		galleryId,
		s3ObjectsDeleted,
		imageMetadataDeleted,
		ordersDeleted
	};
}
