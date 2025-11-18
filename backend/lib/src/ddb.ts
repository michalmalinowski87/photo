import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireEnv } from './aws';

let docClient: DynamoDBDocumentClient | null = null;

export function getDocClient(): DynamoDBDocumentClient {
	if (!docClient) {
		const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
		docClient = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
	}
	return docClient;
}

export async function ddbPut(tableName: string, item: Record<string, any>) {
	const client = getDocClient();
	await client.send(new PutCommand({ TableName: tableName, Item: item }));
}

export async function ddbGet<T>(tableName: string, key: Record<string, any>): Promise<T | undefined> {
	const client = getDocClient();
	const res = await client.send(new GetCommand({ TableName: tableName, Key: key }));
	return res.Item as T | undefined;
}

export async function ddbQueryByOwner<T>(tableName: string, ownerId: string): Promise<T[]> {
	// Requires an ownerId GSI if we add one; for now, fallback to no-op return (to be replaced by scan or GSI later)
	return [];
}

