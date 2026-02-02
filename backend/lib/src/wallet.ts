import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient } from './ddb';

/**
 * Credit user wallet and create ledger entry. Idempotent by refId (same refId skips credit).
 * @returns new balance in cents, or null if refId already used (idempotent skip) or on error.
 */
export async function creditWallet(
	userId: string,
	amountCents: number,
	refId: string,
	walletsTable: string,
	ledgerTable: string
): Promise<number | null> {
	const ddb = getDocClient();
	const now = new Date().toISOString();

	// Idempotency: create ledger entry first with conditional put (same refId = skip)
	try {
		await ddb.send(
			new PutCommand({
				TableName: ledgerTable,
				Item: {
					userId,
					txnId: refId,
					type: 'TOP_UP',
					amountCents,
					refId,
					createdAt: now
				},
				ConditionExpression: 'attribute_not_exists(txnId)'
			})
		);
	} catch (err: any) {
		if (err.name === 'ConditionalCheckFailedException') {
			return null; // already credited for this refId
		}
		throw err;
	}

	const walletGet = await ddb.send(
		new GetCommand({
			TableName: walletsTable,
			Key: { userId }
		})
	);
	const currentBalance = (walletGet.Item as { balanceCents?: number } | undefined)?.balanceCents ?? 0;
	const newBalance = currentBalance + amountCents;

	await ddb.send(
		new UpdateCommand({
			TableName: walletsTable,
			Key: { userId },
			UpdateExpression: 'SET balanceCents = :b, updatedAt = :u',
			ExpressionAttributeValues: { ':b': newBalance, ':u': now }
		})
	);
	return newBalance;
}
