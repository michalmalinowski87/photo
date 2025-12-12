import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
import { getUnpaidTransactionForGallery, updateTransactionStatus } from '../../lib/src/transactions';
import { createGalleryDeletedEmail } from '../../lib/src/email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});

async function getOwnerEmail(gallery: any, userPoolId: string | undefined, logger: any): Promise<string | undefined> {
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
async function deleteS3Prefix(bucket: string, prefix: string, logger?: any): Promise<number> {
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
 * Lambda handler for EventBridge Scheduler-triggered gallery expiration
 * Event payload: { galleryId: string }
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	const sender = envProc?.env?.SENDER_EMAIL as string;
	
	if (!galleriesTable || !bucket) {
		logger.error('Missing required environment variables', {
			galleriesTable: !!galleriesTable,
			bucket: !!bucket
		});
		throw new Error('Missing required environment variables');
	}

	// Extract galleryId from EventBridge Scheduler event
	// EventBridge Scheduler sends: { galleryId: "..." }
	const galleryId = event?.galleryId;
	if (!galleryId) {
		logger.error('Missing galleryId in event payload', { event });
		throw new Error('Missing galleryId in event payload');
	}

	logger.info('Processing gallery expiration', { galleryId });

	try {
		// Fetch gallery from DynamoDB
		const galleryGet = await ddb.send(new GetCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));

		const gallery = galleryGet.Item as any;
		
		// If gallery doesn't exist, it may have been manually deleted - that's okay
		if (!gallery) {
			logger.info('Gallery not found - may have been manually deleted', { galleryId });
			return;
		}

		// Validate expiry - only delete if expiresAt has passed
		const expiresAt = gallery.expiresAt;
		if (!expiresAt) {
			logger.warn('Gallery has no expiresAt - skipping deletion', { galleryId });
			return;
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
			return;
		}

		logger.info('Gallery expired, starting deletion', {
			galleryId,
			expiresAt,
			expiredHoursAgo: (now.getTime() - expiresAtDate.getTime()) / (1000 * 60 * 60)
		});

		// Store email info before deletion
		const galleryName = gallery.galleryName;
		const clientEmail = gallery.clientEmail;
		const ownerEmail = await getOwnerEmail(gallery, userPoolId, logger);

		// Cancel any unpaid transactions for this gallery before deletion
		const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
		if (transactionsTable) {
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

		// Delete all S3 objects for this gallery
		const galleryPrefix = `galleries/${galleryId}/`;
		const deletionStartTime = Date.now();
		const totalS3Deleted = await deleteS3Prefix(bucket, galleryPrefix, logger);
		const deletionDuration = Date.now() - deletionStartTime;
		
		logger.info('Deleted S3 objects', { 
			galleryId, 
			count: totalS3Deleted,
			durationMs: deletionDuration,
			durationSeconds: Math.round(deletionDuration / 1000)
		});
		
		// If deletion took a very long time, log a warning
		// This helps identify galleries that might need Step Functions for future cleanup
		if (deletionDuration > 10 * 60 * 1000) { // > 10 minutes
			logger.warn('S3 deletion took longer than 10 minutes - consider Step Functions for very large galleries', {
				galleryId,
				durationSeconds: Math.round(deletionDuration / 1000),
				objectsDeleted: totalS3Deleted
			});
		}

		// Delete all orders for this gallery
		if (ordersTable) {
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
				logger.info('Deleted orders', { galleryId, count: (ordersQuery.Items || []).length });
			} catch (err: any) {
				logger.error('Failed to delete orders', { error: err.message, galleryId });
				// Continue even if order deletion fails
			}
		}

		// Finally, delete the gallery itself
		await ddb.send(new DeleteCommand({
			TableName: galleriesTable,
			Key: { galleryId }
		}));
		logger.info('Deleted gallery from DynamoDB', { galleryId });

		// Send confirmation emails
		if (sender) {
			const deletionSummary = { s3ObjectsDeleted: totalS3Deleted };
			const emailTemplate = createGalleryDeletedEmail(galleryId, galleryName || galleryId, deletionSummary);

			// Send to photographer
			if (ownerEmail) {
				try {
					await ses.send(new SendEmailCommand({
						Source: sender,
						Destination: { ToAddresses: [ownerEmail] },
						Message: {
							Subject: { Data: emailTemplate.subject },
							Body: {
								Text: { Data: emailTemplate.text },
								Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
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

			// Send to client
			if (clientEmail) {
				try {
					await ses.send(new SendEmailCommand({
						Source: sender,
						Destination: { ToAddresses: [clientEmail] },
						Message: {
							Subject: { Data: emailTemplate.subject },
							Body: {
								Text: { Data: emailTemplate.text },
								Html: emailTemplate.html ? { Data: emailTemplate.html } : undefined
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

		logger.info('Gallery expiration deletion completed', {
			galleryId,
			s3ObjectsDeleted: totalS3Deleted
		});

	} catch (error: any) {
		logger.error('Gallery expiration deletion failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			galleryId
		});
		// Re-throw to trigger DLQ
		throw error;
	}
});

