import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { cancelUserDeletionSchedule } from '../../lib/src/user-deletion-scheduler';
import { createDeletionCompletedEmail } from '../../lib/src/email';
import { deleteGallery } from '../../lib/src/gallery-deletion';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});

/**
 * Batch deletes S3 objects under a prefix
 * Reused from gallery-deletion.ts pattern
 */
async function deleteS3Prefix(
	bucket: string,
	prefix: string,
	logger: any
): Promise<number> {
	let continuationToken: string | undefined;
	let totalDeleted = 0;
	const startTime = Date.now();
	const MAX_EXECUTION_TIME_MS = 14 * 60 * 1000; // 14 minutes
	
	do {
		const elapsed = Date.now() - startTime;
		if (elapsed > MAX_EXECUTION_TIME_MS) {
			logger.warn('Approaching Lambda timeout, stopping S3 deletion', {
				prefix,
				totalDeleted,
				elapsedMs: elapsed
			});
			break;
		}
		
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			ContinuationToken: continuationToken,
			MaxKeys: 1000
		}));

		if (listResponse.Contents && listResponse.Contents.length > 0) {
			const BATCH_SIZE = 1000;
			const PARALLEL_BATCHES = 5;
			const chunks: any[][] = [];
			
			for (let i = 0; i < listResponse.Contents.length; i += BATCH_SIZE) {
				chunks.push(listResponse.Contents.slice(i, i + BATCH_SIZE));
			}

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
						return deleteResponse.Deleted?.length || 0;
					}).catch(() => {
						return 0;
					});
				});
				
				const results = await Promise.all(deletePromises);
				totalDeleted += results.reduce((sum, count) => sum + count, 0);
				
				const elapsedAfterBatch = Date.now() - startTime;
				if (elapsedAfterBatch > MAX_EXECUTION_TIME_MS) {
					break;
				}
			}
		}

		continuationToken = listResponse.NextContinuationToken;
	} while (continuationToken);

	return totalDeleted;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const packagesTable = envProc?.env?.PACKAGES_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	const bucket = envProc?.env?.BUCKET_NAME as string;
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	const sender = envProc?.env?.SENDER_EMAIL as string;

	if (!usersTable || !bucket) {
		logger.error('Missing required configuration', {
			hasUsersTable: !!usersTable,
			hasBucket: !!bucket
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required configuration' })
		};
	}

	// Extract userId from event (from EventBridge Scheduler)
	const userId = event.userId || event.pathParameters?.userId;
	if (!userId) {
		logger.error('Missing userId in event', { event });
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing userId' })
		};
	}

	logger.info('Starting user deletion', { userId });

	try {
		// 1. Load user and verify still pending deletion
		const userResult = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId }
		}));

		if (!userResult.Item) {
			logger.warn('User not found', { userId });
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'User not found' })
			};
		}

		const user = userResult.Item as any;
		
		// Verify user is still pending deletion
		if (user.status !== 'pendingDeletion') {
			logger.warn('User is not pending deletion', { userId, status: user.status });
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'User is not pending deletion', status: user.status })
			};
		}

		// Preserve email before deletion for final confirmation email
		const userEmail = user.contactEmail || user.email || `deleted_user_${userId}@deleted.example.com`;

		// 2. Process galleries: Delete galleries without delivered orders, preserve galleries with delivered orders
		let galleriesDeleted = 0;
		let galleriesPreserved = 0;
		let galleriesUpdated = 0;
		
		if (galleriesTable) {
			try {
				let lastEvaluatedKey: any = undefined;
				do {
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
						if (ordersTable) {
							try {
								// Try using GSI first, fall back to query + filter
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
								// If we can't check, err on the side of preserving the gallery
								hasDeliveredOrders = true;
							}
						}
						
						if (!hasDeliveredOrders) {
							// No delivered orders - delete entire gallery
							try {
								const imagesTable = envProc?.env?.IMAGES_TABLE as string;
								const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
								
								await deleteGallery(
									gallery,
									{
										galleriesTable,
										ordersTable,
										imagesTable,
										bucket,
										transactionsTable,
										userPoolId,
										sender
									},
									{
										ddb,
										s3,
										ses,
										cognito
									},
									logger,
									{
										validateExpiry: false, // User deletion doesn't validate expiry
										sendEmails: false // Don't send emails for user deletion-triggered gallery deletions
									}
								);
								galleriesDeleted++;
								logger.info('Deleted gallery without delivered orders', { galleryId, userId });
							} catch (deleteErr: any) {
								logger.error('Failed to delete gallery', {
									error: deleteErr.message,
									galleryId,
									userId
								});
								// Continue with other galleries even if one fails
							}
						} else {
							// Has delivered orders - preserve gallery but denormalize ownerEmail
							if (!gallery.ownerEmail && userEmail) {
								try {
									await ddb.send(new PutCommand({
										TableName: galleriesTable,
										Item: {
											...gallery,
											ownerEmail: userEmail,
											updatedAt: new Date().toISOString()
										}
									}));
									galleriesUpdated++;
								} catch (updateErr: any) {
									logger.warn('Failed to update gallery with ownerEmail', {
										error: updateErr.message,
										galleryId: gallery.galleryId,
										userId
									});
								}
							}
							galleriesPreserved++;
							logger.info('Preserved gallery with delivered orders', { galleryId, userId });
						}
					}

					lastEvaluatedKey = galleriesQuery.LastEvaluatedKey;
				} while (lastEvaluatedKey);

				logger.info('Processed galleries for user deletion', { 
					userId, 
					galleriesDeleted,
					galleriesPreserved,
					galleriesUpdated 
				});
			} catch (galleriesErr: any) {
				logger.error('Failed to process galleries', {
					error: galleriesErr.message,
					userId
				});
				// Continue with deletion even if gallery processing fails
			}
		}

		// 3. Delete S3 originals/previews/thumbs for preserved galleries only (NOT finals, NOT gallery records)
		// Note: Galleries without delivered orders were already fully deleted in step 2
		let totalS3Deleted = 0;
		if (galleriesTable && bucket && galleriesPreserved > 0) {
			try {
				let lastEvaluatedKey: any = undefined;
				do {
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
						
						// Delete originals, previews, thumbs, bigthumbs (NOT finals)
						// These galleries have delivered orders, so we preserve the gallery but remove photographer's originals
						const prefixes = [
							`galleries/${galleryId}/originals/`,
							`galleries/${galleryId}/previews/`,
							`galleries/${galleryId}/thumbs/`,
							`galleries/${galleryId}/bigthumbs/`
						];

						for (const prefix of prefixes) {
							try {
								const deleted = await deleteS3Prefix(bucket, prefix, logger);
								totalS3Deleted += deleted;
								logger.info('Deleted S3 prefix for preserved gallery', {
									galleryId,
									prefix,
									deleted
								});
							} catch (s3Err: any) {
								logger.warn('Failed to delete S3 prefix', {
									error: s3Err.message,
									galleryId,
									prefix
								});
							}
						}
					}

					lastEvaluatedKey = galleriesQuery.LastEvaluatedKey;
				} while (lastEvaluatedKey);

				logger.info('Deleted S3 objects for preserved galleries', { userId, totalS3Deleted });
			} catch (s3Err: any) {
				logger.error('Failed to delete S3 objects', {
					error: s3Err.message,
					userId
				});
				// Continue with deletion even if S3 deletion fails
			}
		}

		// 4. Note: Clients are NOT deleted - they are separate entities (end users who view galleries)
		// Clients need to continue accessing their galleries even after photographer account deletion
		// Galleries remain active and accessible to clients via gallery links
		
		// 5. Delete packages (photographer's pricing packages - photographer-specific configurations)
		let packagesDeleted = 0;
		if (packagesTable) {
			try {
				let lastEvaluatedKey: any = undefined;
				do {
					const packagesQuery = await ddb.send(new QueryCommand({
						TableName: packagesTable,
						IndexName: 'ownerId-index',
						KeyConditionExpression: 'ownerId = :o',
						ExpressionAttributeValues: { ':o': userId },
						Limit: 100
					}));

					const packages = packagesQuery.Items || [];
					
					// Delete packages in batches
					for (const pkg of packages) {
						try {
							await ddb.send(new DeleteCommand({
								TableName: packagesTable,
								Key: { packageId: pkg.packageId }
							}));
							packagesDeleted++;
						} catch (deleteErr: any) {
							logger.warn('Failed to delete package', {
								error: deleteErr.message,
								packageId: pkg.packageId
							});
						}
					}

					lastEvaluatedKey = packagesQuery.LastEvaluatedKey;
				} while (lastEvaluatedKey);

				logger.info('Deleted packages', { userId, packagesDeleted });
			} catch (packagesErr: any) {
				logger.error('Failed to delete packages', {
					error: packagesErr.message,
					userId
				});
				// Continue with deletion even if package deletion fails
			}
		}

		// 6. Create forcedPayoutUponDeletion transaction
		if (walletsTable && ledgerTable && transactionsTable) {
			try {
				// Get wallet balance
				const walletResult = await ddb.send(new GetCommand({
					TableName: walletsTable,
					Key: { userId }
				}));

				const walletBalance = walletResult.Item?.balanceCents || 0;

				if (walletBalance > 0) {
					// Generate transaction ID
					const transactionId = `forcedPayoutUponDeletion_${userId}_${Date.now()}`;
					const now = new Date().toISOString();

					// Create transaction
					await ddb.send(new PutCommand({
						TableName: transactionsTable,
						Item: {
							userId,
							transactionId,
							type: 'FORCED_PAYOUT_UPON_DELETION',
							status: 'PAID',
							amountCents: walletBalance,
							walletAmountCents: walletBalance,
							stripeAmountCents: 0,
							paymentMethod: 'FORCED',
							createdAt: now,
							metadata: {
								reason: 'Account deletion',
								originalBalance: walletBalance
							}
						}
					}));

					// Update wallet balance to 0
					await ddb.send(new PutCommand({
						TableName: walletsTable,
						Item: {
							userId,
							balanceCents: 0,
							updatedAt: now
						}
					}));

					// Create ledger entry
					await ddb.send(new PutCommand({
						TableName: ledgerTable,
						Item: {
							userId,
							txnId: transactionId,
							type: 'FORCED_PAYOUT',
							amountCents: -walletBalance,
							refId: transactionId,
							createdAt: now
						}
					}));

					logger.info('Created forcedPayoutUponDeletion transaction', {
						userId,
						transactionId,
						walletBalance
					});
				} else {
					logger.info('No wallet balance to clear', { userId });
				}
			} catch (walletErr: any) {
				logger.error('Failed to create forcedPayoutUponDeletion transaction', {
					error: walletErr.message,
					userId
				});
				// Continue with deletion even if wallet transaction fails
			}
		}

		// 7. Soft delete user - nullify PII, preserve userId and transactional data
		const deletedEmail = `deleted_user_${userId}@deleted.example.com`;
		const now = new Date().toISOString();
		
		const softDeletedUser: any = {
			userId,
			status: 'deleted',
			email: deletedEmail,
			contactEmail: deletedEmail,
			businessName: null,
			phone: null,
			address: null,
			nip: null,
			deletedAt: now,
			updatedAt: now
		};

		// Preserve createdAt and other non-PII fields
		if (user.createdAt) {
			softDeletedUser.createdAt = user.createdAt;
		}

		await ddb.send(new PutCommand({
			TableName: usersTable,
			Item: softDeletedUser
		}));

		logger.info('Soft deleted user', { userId });

		// 8. Delete Cognito user
		if (userPoolId) {
			try {
				await cognito.send(new AdminDeleteUserCommand({
					UserPoolId: userPoolId,
					Username: userId
				}));
				logger.info('Deleted Cognito user', { userId });
			} catch (cognitoErr: any) {
				logger.error('Failed to delete Cognito user', {
					error: cognitoErr.message,
					userId
				});
				// Continue even if Cognito deletion fails
			}
		}

		// 9. Cancel EventBridge schedule (user deletion schedule, not gallery schedules)
		try {
			await cancelUserDeletionSchedule(userId);
			logger.info('Canceled user deletion EventBridge schedule', { userId });
		} catch (scheduleErr: any) {
			logger.warn('Failed to cancel EventBridge schedule (may not exist)', {
				error: scheduleErr.message,
				userId
			});
			// Continue even if schedule cancellation fails
		}

		// 10. Send final confirmation email (to preserved email)
		if (sender && userEmail && userEmail !== deletedEmail) {
			try {
				const emailTemplate = createDeletionCompletedEmail(userEmail);
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
				logger.info('Sent deletion completion email', { userId, email: userEmail });
			} catch (emailErr: any) {
				logger.error('Failed to send deletion completion email', {
					error: emailErr.message,
					userId,
					email: userEmail
				});
				// Continue even if email fails
			}
		}

		// 11. Log full audit trail
		logger.info('User deletion completed', {
			userId,
			galleriesDeleted,
			galleriesPreserved,
			galleriesUpdated,
			totalS3Deleted,
			packagesDeleted,
			deletionReason: user.deletionReason || 'manual',
			deletionRequestedAt: user.deletionRequestedAt,
			deletedAt: now,
			note: 'Galleries with delivered orders preserved, galleries without delivered orders deleted'
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				message: 'User deletion completed',
				userId,
				galleriesDeleted,
				galleriesPreserved,
				galleriesUpdated,
				totalS3Deleted,
				packagesDeleted,
				note: 'Galleries with delivered orders preserved, galleries without delivered orders deleted'
			})
		};
	} catch (error: any) {
		logger.error('User deletion failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			userId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				error: 'User deletion failed',
				message: error.message
			})
		};
	}
});

