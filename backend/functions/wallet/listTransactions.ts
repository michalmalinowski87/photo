import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const ledgerTable = envProc?.env?.WALLET_LEDGER_TABLE as string;
	if (!ledgerTable) {
		logger?.error('Missing WALLET_LEDGER_TABLE environment variable');
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing WALLET_LEDGER_TABLE' })
		};
	}

	const requester = getUserIdFromEvent(event);
	if (!requester) {
		logger?.warn('Unauthorized wallet transactions request', { 
			hasAuthorizer: !!event?.requestContext?.authorizer,
			hasJWT: !!event?.requestContext?.authorizer?.jwt 
		});
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	const limit = parseInt(event?.queryStringParameters?.limit || '50', 10);
	const limitClamped = Math.min(Math.max(limit, 1), 100);

	try {
		const query = await ddb.send(new QueryCommand({
			TableName: ledgerTable,
			KeyConditionExpression: 'userId = :u',
			ExpressionAttributeValues: { ':u': requester },
			ScanIndexForward: false, // newest first
			Limit: limitClamped
		}));

		const transactions = (query.Items || []).map((item: any) => ({
			txnId: item.txnId,
			type: item.type,
			amountCents: item.amountCents,
			amount: item.amountCents / 100,
			refId: item.refId,
			createdAt: item.createdAt
		}));

		logger?.info('Wallet transactions retrieved', { userId: requester, count: transactions.length });

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				userId: requester,
				transactions,
				count: transactions.length
			})
		};
	} catch (error: any) {
		logger?.error('List transactions failed', {
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack
			},
			userId: requester
		});
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list transactions', message: error.message })
		};
	}
});

