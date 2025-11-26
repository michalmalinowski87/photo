import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { getTransaction, updateTransactionStatus } from '../../lib/src/transactions';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function getWalletBalance(userId: string, walletsTable: string): Promise<number> {
	try {
		const walletGet = await ddb.send(new GetCommand({
			TableName: walletsTable,
			Key: { userId }
		}));
		return walletGet.Item?.balanceCents || 0;
	} catch (error) {
		return 0;
	}
}

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const transactionId = event?.pathParameters?.id;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	const stripeSecretKey = envProc?.env?.STRIPE_SECRET_KEY as string;
	const apiUrl = envProc?.env?.PUBLIC_API_URL as string || '';

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

		if (transaction.status !== 'UNPAID' && transaction.status !== 'FAILED') {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: `Cannot retry transaction with status ${transaction.status}` })
			};
		}

		// Check wallet balance for fractional payment
		let walletAmountCents = transaction.walletAmountCents || 0;
		let stripeAmountCents = transaction.stripeAmountCents || transaction.amountCents;
		
		if (walletsTable && transaction.paymentMethod !== 'STRIPE') {
			const walletBalance = await getWalletBalance(requester, walletsTable);
			walletAmountCents = Math.min(walletBalance, transaction.amountCents);
			stripeAmountCents = transaction.amountCents - walletAmountCents;
		}

		// If fully paid with wallet, update transaction and return
		if (walletAmountCents === transaction.amountCents && walletsTable) {
			// This would require wallet debit logic - for now, just create Stripe checkout
			// In a full implementation, we'd debit wallet here
		}

		// Create Stripe checkout for remaining amount
		if (!stripeSecretKey || stripeAmountCents <= 0) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Stripe not configured or no amount to charge' })
			};
		}

		const stripe = new Stripe(stripeSecretKey);
		const dashboardUrl = envProc?.env?.PUBLIC_DASHBOARD_URL || envProc?.env?.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000';
		const redirectUrl = transaction.galleryId 
			? `${dashboardUrl}/galleries?payment=success&gallery=${transaction.galleryId}`
			: `${dashboardUrl}/wallet?payment=success`;
		
		const successUrl = apiUrl 
			? `${apiUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`
			: `https://your-frontend/payments/success?session_id={CHECKOUT_SESSION_ID}`;
		const cancelUrl = apiUrl
			? `${apiUrl}/payments/cancel?transactionId=${transactionId}&userId=${requester}`
			: `https://your-frontend/payments/cancel?transactionId=${transactionId}&userId=${requester}`;

		/**
		 * Calculate Stripe processing fees for PLN payments
		 * Stripe fees: ~1.4% + 1 PLN for domestic cards, ~2.9% + 1 PLN for international cards
		 * We use a conservative estimate: 2.9% + 1 PLN to ensure we cover fees
		 */
		function calculateStripeFee(amountCents: number): number {
			const feePercentage = 0.029; // 2.9%
			const fixedFeeCents = 100; // 1 PLN
			const percentageFee = Math.ceil(amountCents * feePercentage);
			return percentageFee + fixedFeeCents;
		}

		// USER-CENTRIC FIX: Add Stripe fees to gallery payments (user pays fees)
		// Wallet top-ups don't go through retry - they use checkoutCreate.ts which handles fees correctly
		const stripeFeeCents = stripeAmountCents > 0 && transaction.type === 'GALLERY_PLAN' 
			? calculateStripeFee(stripeAmountCents) 
			: 0;
		const totalChargeAmountCents = stripeAmountCents + stripeFeeCents;

		const lineItems: any[] = [
			{
				price_data: {
					currency: 'pln',
					product_data: {
						name: transaction.type === 'GALLERY_PLAN' ? `Gallery: ${transaction.galleryId}` : `Transaction: ${transaction.type}`,
						description: walletAmountCents > 0 
							? `Total: ${(transaction.amountCents / 100).toFixed(2)} PLN (${(walletAmountCents / 100).toFixed(2)} PLN from wallet, ${(stripeAmountCents / 100).toFixed(2)} PLN due)`
							: `Payment for ${transaction.type}`
					},
					unit_amount: stripeAmountCents
				},
				quantity: 1
			}
		];
		
		// Add Stripe processing fee as separate line item for gallery payments (user pays fees)
		if (stripeFeeCents > 0 && transaction.type === 'GALLERY_PLAN') {
			lineItems.push({
				price_data: {
					currency: 'pln',
					product_data: {
						name: 'Opłata za przetwarzanie płatności',
						description: 'Stripe processing fee'
					},
					unit_amount: stripeFeeCents
				},
				quantity: 1
			});
		}

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			mode: 'payment',
			line_items: lineItems,
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: {
				userId: requester,
				type: transaction.type === 'GALLERY_PLAN' ? 'gallery_payment' : 'transaction_payment',
				galleryId: transaction.galleryId || '',
				transactionId: transactionId,
				walletAmountCents: walletAmountCents.toString(),
				stripeAmountCents: stripeAmountCents.toString(),
				redirectUrl: redirectUrl
			}
		});

		// Update transaction with new Stripe session ID
		await updateTransactionStatus(requester, transactionId, 'UNPAID', {
			stripeSessionId: session.id
		});

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				checkoutUrl: session.url,
				sessionId: session.id,
				transactionId,
				walletAmountCents,
				stripeAmountCents
			})
		};
	} catch (error: any) {
		logger?.error('Retry transaction failed', {
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
			body: JSON.stringify({ error: 'Failed to retry transaction', message: error.message })
		};
	}
});

