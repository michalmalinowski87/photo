import { lambdaLogger } from '../../../packages/logger/src';
import { getTransaction, updateTransactionStatus } from '../../lib/src/transactions';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');
import { generatePaymentPageHTML } from './payment-page-template';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const getSecurityHeaders = () => ({
	'Content-Type': 'text/html; charset=utf-8',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
});

const addCancelledParam = (url: string): string => {
	try {
		const parsed = new URL(url);
		parsed.searchParams.set('payment', 'cancelled');
		return parsed.toString();
	} catch {
		// Relative URL - handle manually
		const [path, query] = url.split('?');
		const params = new URLSearchParams(query || '');
		params.set('payment', 'cancelled');
		return `${path}?${params.toString()}`;
	}
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const clearPaymentLock = async (galleryId: string, galleriesTable: string, logger: any) => {
	try {
		await ddb.send(new UpdateCommand({
			TableName: galleriesTable,
			Key: { galleryId },
			UpdateExpression: 'REMOVE paymentLocked, paymentLockedAt SET updatedAt = :u',
			ExpressionAttributeValues: { ':u': new Date().toISOString() }
		}));
		logger?.info('Cleared paymentLocked flag', { galleryId });
	} catch (err: any) {
		logger?.warn('Failed to clear paymentLocked flag', { error: err.message, galleryId });
	}
};

const cancelTransaction = async (
	userId: string,
	transactionId: string,
	galleriesTable: string | undefined,
	logger: any
) => {
	try {
		const transaction = await getTransaction(userId, transactionId);
		if (transaction?.status === 'UNPAID') {
			await updateTransactionStatus(userId, transactionId, 'CANCELED');
			logger?.info('Transaction canceled', { transactionId, userId });
			
			if (transaction.galleryId && galleriesTable) {
				await clearPaymentLock(transaction.galleryId, galleriesTable, logger);
			}
		}
	} catch (err: any) {
		logger?.warn('Failed to cancel transaction', { error: err.message, transactionId, userId });
	}
};

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	
	const sessionId = event?.queryStringParameters?.session_id;
	const transactionId = event?.queryStringParameters?.transactionId;
	const userId = event?.queryStringParameters?.userId;

	// Default to root dashboard if no valid session
	let redirectUrl = `${dashboardUrl}/`;

	// Try to get redirectUrl from Stripe session metadata (primary method)
	if (sessionId && stripeSecretKey) {
		try {
			const stripe = new Stripe(stripeSecretKey);
			const session = await stripe.checkout.sessions.retrieve(sessionId);
			
			if (session.metadata?.redirectUrl) {
				redirectUrl = addCancelledParam(session.metadata.redirectUrl);
			}

			// Cancel transaction if available in metadata
			const metadataTransactionId = session.metadata?.transactionId;
			const metadataUserId = session.metadata?.userId;
			if (metadataTransactionId && metadataUserId) {
				await cancelTransaction(metadataUserId, metadataTransactionId, galleriesTable, logger);
			}
		} catch (err: any) {
			logger?.error('Failed to retrieve Stripe session', { error: err.message, sessionId });
			// On error, keep default root dashboard redirect
		}
	}

	// Fallback: Cancel transaction from query params
	if (transactionId && userId && !sessionId) {
		await cancelTransaction(userId, transactionId, galleriesTable, logger);
	}

	const html = generatePaymentPageHTML({
		title: 'Płatność anulowana',
		message: 'Płatność została anulowana. Możesz spróbować ponownie później.',
		redirectUrl,
		redirectDelay: 2000,
		isSuccess: false
	});

	return {
		statusCode: 200,
		headers: getSecurityHeaders(),
		body: html
	};
});
