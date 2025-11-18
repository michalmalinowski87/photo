import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const walletsTable = envProc?.env?.WALLETS_TABLE as string;
	if (!walletsTable) {
		logger?.error('Missing WALLETS_TABLE environment variable');
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing WALLETS_TABLE' })
		};
	}

	const requester = getUserIdFromEvent(event);
	if (!requester) {
		logger?.warn('Unauthorized wallet balance request', { 
			hasAuthorizer: !!event?.requestContext?.authorizer,
			hasJWT: !!event?.requestContext?.authorizer?.jwt 
		});
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized. Please log in.' })
		};
	}

	try {
		const wallet = await ddb.send(new GetCommand({
			TableName: walletsTable,
			Key: { userId: requester }
		}));

		// If wallet doesn't exist, create it with zero balance
		if (!wallet.Item) {
			logger?.info('Creating new wallet for user', { userId: requester });
			const now = new Date().toISOString();
			await ddb.send(new PutCommand({
				TableName: walletsTable,
				Item: {
					userId: requester,
					balanceCents: 0,
					currency: 'PLN',
					createdAt: now,
					updatedAt: now
				}
			}));
			
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					userId: requester,
					balanceCents: 0,
					balance: 0,
					currency: 'PLN'
				})
			};
		}

		const balanceCents = wallet.Item.balanceCents || 0;
		const currency = wallet.Item.currency || 'PLN';

		logger?.info('Wallet balance retrieved', { userId: requester, balanceCents });

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				userId: requester,
				balanceCents,
				balance: balanceCents / 100,
				currency
			})
		};
	} catch (error: any) {
		logger?.error('Get balance failed', {
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
			body: JSON.stringify({ error: 'Failed to get balance', message: error.message })
		};
	}
});

