import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getUnpaidTransactionForGallery, updateTransactionStatus } from '../../lib/src/transactions';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;

	if (!galleriesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing GALLERIES_TABLE' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId' })
		};
	}

	const requester = getUserIdFromEvent(event);
	if (!requester) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	// Get gallery to verify ownership
	const galleryGet = await ddb.send(new GetCommand({
		TableName: galleriesTable,
		Key: { galleryId }
	}));

	const gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}

	requireOwnerOr403(gallery.ownerId, requester);

	// Find and cancel unpaid transaction
	const transactionsTable = envProc?.env?.TRANSACTIONS_TABLE as string;
	if (!transactionsTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'TRANSACTIONS_TABLE not configured' })
		};
	}

	try {
		const unpaidTransaction = await getUnpaidTransactionForGallery(galleryId);
		if (!unpaidTransaction) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'No unpaid transaction found for this gallery' })
			};
		}

		// Cancel the transaction
		await updateTransactionStatus(unpaidTransaction.userId, unpaidTransaction.transactionId, 'CANCELED');
		
		logger.info('Transaction canceled (gallery kept)', {
			transactionId: unpaidTransaction.transactionId,
			galleryId,
			userId: unpaidTransaction.userId
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				message: 'Transaction canceled successfully. Gallery remains available for payment.',
				transactionId: unpaidTransaction.transactionId,
				galleryId
			})
		};
	} catch (error: any) {
		logger.error('Failed to cancel transaction', {
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
			body: JSON.stringify({ error: 'Failed to cancel transaction', message: error.message })
		};
	}
});

