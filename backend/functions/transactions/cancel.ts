import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { getTransaction, updateTransactionStatus } from '../../lib/src/transactions';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const transactionId = event?.pathParameters?.id;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;

	if (!transactionId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing transactionId' })
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

	try {
		const transaction = await getTransaction(requester, transactionId);
		
		if (!transaction) {
			return {
				statusCode: 404,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Transaction not found' })
			};
		}

		if (transaction.status !== 'UNPAID') {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: `Cannot cancel transaction with status ${transaction.status}` })
			};
		}

		// Update transaction status to CANCELED
		await updateTransactionStatus(requester, transactionId, 'CANCELED');

		// If transaction is for a gallery, delete the gallery
		if (transaction.type === 'GALLERY_PLAN' && transaction.galleryId && galleriesTable) {
			try {
				// Get gallery to verify ownership
				const galleryGet = await ddb.send(new GetCommand({
					TableName: galleriesTable,
					Key: { galleryId: transaction.galleryId }
				}));

				if (galleryGet.Item && galleryGet.Item.ownerId === requester) {
					await ddb.send(new DeleteCommand({
						TableName: galleriesTable,
						Key: { galleryId: transaction.galleryId }
					}));
					logger?.info('Gallery deleted after transaction cancellation', {
						galleryId: transaction.galleryId,
						transactionId
					});
				}
			} catch (galleryErr: any) {
				logger?.error('Failed to delete gallery after transaction cancellation', {
					error: galleryErr.message,
					galleryId: transaction.galleryId,
					transactionId
				});
			}
		}

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				transactionId,
				status: 'CANCELED',
				message: 'Transaction canceled successfully'
			})
		};
	} catch (error: any) {
		logger?.error('Cancel transaction failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			transactionId,
			userId: requester
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to cancel transaction', message: error.message })
		};
	}
});

