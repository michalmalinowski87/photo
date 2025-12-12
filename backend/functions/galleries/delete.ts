import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { createGalleryDeletedEmail } from '../../lib/src/email';
import { getUnpaidTransactionForGallery, updateTransactionStatus } from '../../lib/src/transactions';
import { cancelExpirySchedule, getScheduleName } from '../../lib/src/expiry-scheduler';

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

async function deleteS3Prefix(bucket: string, prefix: string, logger?: any) {
	let continuationToken: string | undefined;
	let deletedCount = 0;
	
	do {
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			ContinuationToken: continuationToken
		}));

		if (listResponse.Contents && listResponse.Contents.length > 0) {
			await Promise.all(listResponse.Contents.map(obj => 
				s3.send(new DeleteObjectCommand({
					Bucket: bucket,
					Key: obj.Key!
				})).catch(err => {
					if (logger) {
						logger.warn('Failed to delete S3 object', { key: obj.Key, error: err.message });
					} else {
						console.error(`Failed to delete ${obj.Key}:`, err);
					}
				})
			));
			deletedCount += listResponse.Contents.length;
		}

		continuationToken = listResponse.NextContinuationToken;
	} while (continuationToken);

	return deletedCount;
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	
	if (!galleriesTable || !bucket) {
		return { 
			statusCode: 500, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' }) 
		};
	}

	const galleryId = event?.pathParameters?.id;
	if (!galleryId) {
		return { 
			statusCode: 400, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'missing id' }) 
		};
	}

	const requester = getUserIdFromEvent(event);
	const got = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = got.Item as any;
	if (!gallery) {
		return { 
			statusCode: 404, 
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' }) 
		};
	}
	
	// Only require owner check if requester is present (manual deletion)
	// If no requester, assume it's triggered by expiry
	if (requester) {
		requireOwnerOr403(gallery.ownerId, requester);
	}

	// Store email info before deletion
	const galleryName = gallery.galleryName;
	const clientEmail = gallery.clientEmail;
	const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
	const sender = envProc?.env?.SENDER_EMAIL as string;
	const ownerEmail = await getOwnerEmail(gallery, userPoolId, logger);

	logger.info('Starting gallery deletion', { galleryId, ownerId: gallery.ownerId, triggeredBy: requester ? 'manual' : 'expiry' });

	try {
		// Cancel EventBridge schedule if it exists (idempotent - won't fail if doesn't exist)
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
		// Delete all S3 objects for this gallery (everything under galleries/${galleryId}/)
		// This includes all subdirectories (originals, previews, thumbs, final, zips, archive)
		// as well as any files directly under the gallery directory (e.g., cover photos)
		const galleryPrefix = `galleries/${galleryId}/`;
		const totalS3Deleted = await deleteS3Prefix(bucket, galleryPrefix, logger);

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
				logger.info('Deleted orders', { count: (ordersQuery.Items || []).length });
			} catch (err: any) {
				logger.error('Failed to delete orders', { error: err.message, galleryId });
			}
		}

		// Finally, delete the gallery itself
		await ddb.send(new DeleteCommand({ TableName: galleriesTable, Key: { galleryId } }));

		logger.info('Gallery deletion completed', {
			galleryId,
			s3ObjectsDeleted: totalS3Deleted
		});

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

		return { 
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				message: 'Gallery and all related data deleted',
				galleryId,
				s3ObjectsDeleted: totalS3Deleted
			})
		};
	} catch (error: any) {
		logger.error('Gallery deletion failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			galleryId
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Deletion failed', message: error.message })
		};
	}
});

