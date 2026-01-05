import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SESClient } = require('@aws-sdk/client-ses');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { deleteGallery } from '../../lib/src/gallery-deletion';
import { getSenderEmail } from '../../lib/src/email-config';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});

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

	logger.info('Starting gallery deletion', { galleryId, ownerId: gallery.ownerId, triggeredBy: requester ? 'manual' : 'expiry' });

	try {
		const userPoolId = envProc?.env?.COGNITO_USER_POOL_ID as string;
		const sender = await getSenderEmail();
		const imagesTable = envProc?.env?.IMAGES_TABLE as string;
		const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;

		const result = await deleteGallery(
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
				validateExpiry: false, // Manual deletion doesn't validate expiry
				sendEmails: true
			}
		);

		return { 
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				message: 'Gallery and all related data deleted',
				galleryId: result.galleryId,
				s3ObjectsDeleted: result.s3ObjectsDeleted,
				imageMetadataDeleted: result.imageMetadataDeleted,
				ordersDeleted: result.ordersDeleted
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

