import { lambdaLogger } from '../../../packages/logger/src';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { getTransaction } from '../../lib/src/transactions';

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const transactionId = event?.pathParameters?.id;

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

		// Map transaction type to display type
		let displayType = transaction.type;
		if (transaction.type === 'GALLERY_PLAN' || transaction.type === 'GALLERY_PLAN_UPGRADE') {
			if (transaction.paymentMethod === 'WALLET') {
				displayType = 'WALLET_DEBIT';
			} else if (transaction.paymentMethod === 'STRIPE') {
				displayType = 'STRIPE_CHECKOUT';
			} else if (transaction.paymentMethod === 'MIXED') {
				displayType = 'MIXED';
			}
		}
		// WALLET_TOPUP stays as WALLET_TOPUP (no mapping needed)

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				...transaction,
				displayType
			})
		};
	} catch (error: any) {
		logger?.error('Get transaction failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			transactionId,
			userId: requester
		});
		const { createLambdaErrorResponse } = require('../../lib/src/error-utils');
		return createLambdaErrorResponse(error, 'Failed to get transaction', 500);
	}
});

