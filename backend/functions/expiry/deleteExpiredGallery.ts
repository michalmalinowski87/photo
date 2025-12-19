import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
import { deleteGallery } from '../../lib/src/gallery-deletion';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});

/**
 * Lambda handler for EventBridge Scheduler-triggered gallery expiration
 * Event payload: { galleryId: string }
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	const imagesTable = envProc?.env?.IMAGES_TABLE as string;
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

		const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;

		// Use shared deletion function with expiry validation
		try {
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
					validateExpiry: true, // Validate expiry for scheduler-triggered deletions
					sendEmails: true
				}
			);

			logger.info('Gallery expiration deletion completed', { galleryId });
		} catch (error: any) {
			// Handle "not yet expired" case gracefully - don't trigger DLQ
			if (error.message === 'Gallery not yet expired' || error.message === 'Gallery has no expiresAt') {
				logger.info('Gallery deletion skipped', { galleryId, reason: error.message });
				return;
			}
			// Re-throw other errors to trigger DLQ
			throw error;
		}

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

