import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const clientsTable = envProc?.env?.CLIENTS_TABLE as string;
	
	if (!clientsTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing CLIENTS_TABLE environment variable' })
		};
	}

	const ownerId = getUserIdFromEvent(event);
	if (!ownerId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	const limit = parseInt(event?.queryStringParameters?.limit || '20', 10);
	const limitClamped = Math.min(Math.max(limit, 1), 100);
	const lastKeyParam = event?.queryStringParameters?.lastKey;
	let exclusiveStartKey: Record<string, any> | undefined;
	if (lastKeyParam) {
		try {
			exclusiveStartKey = JSON.parse(decodeURIComponent(lastKeyParam));
		} catch (e) {
			// Invalid lastKey, ignore
		}
	}

	const searchQuery = event?.queryStringParameters?.search?.trim().toLowerCase() || '';
	const pageOffset = parseInt(event?.queryStringParameters?.offset || '0', 10);

	try {
		let allItems: any[] = [];
		let lastKey: Record<string, any> | undefined;
		let hasMore = false;

		if (searchQuery) {
			// For search, fetch all items (up to reasonable limit) and filter
			// Then paginate through filtered results
			const queryParams: any = {
				TableName: clientsTable,
				IndexName: 'ownerId-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				},
				ScanIndexForward: false,
				Limit: 500 // Fetch up to 500 items for search
			};

			// Continue fetching until we have enough or no more items
			let lastEvaluatedKey = exclusiveStartKey;
			do {
				if (lastEvaluatedKey) {
					queryParams.ExclusiveStartKey = lastEvaluatedKey;
				}
				const result = await ddb.send(new QueryCommand(queryParams));
				allItems = allItems.concat(result.Items || []);
				lastEvaluatedKey = result.LastEvaluatedKey;
			} while (lastEvaluatedKey && allItems.length < 500);

			// Filter items
			allItems = allItems.filter((item: any) => {
				const email = (item.email || '').toLowerCase();
				const firstName = (item.firstName || '').toLowerCase();
				const lastName = (item.lastName || '').toLowerCase();
				const companyName = (item.companyName || '').toLowerCase();
				const nip = (item.nip || '').toLowerCase();
				const phone = (item.phone || '').toLowerCase();
				
				return (
					email.includes(searchQuery) ||
					firstName.includes(searchQuery) ||
					lastName.includes(searchQuery) ||
					companyName.includes(searchQuery) ||
					nip.includes(searchQuery) ||
					phone.includes(searchQuery)
				);
			});

			// Apply pagination to filtered results
			const startIndex = pageOffset;
			const endIndex = startIndex + limitClamped;
			hasMore = endIndex < allItems.length;
			const items = allItems.slice(startIndex, endIndex);
			
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					items,
					count: items.length,
					hasMore,
					lastKey: null // Not using cursor-based pagination for search
				})
			};
		} else {
			// Normal pagination without search
			const queryParams: any = {
				TableName: clientsTable,
				IndexName: 'ownerId-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				},
				ScanIndexForward: false,
				Limit: limitClamped + 1
			};

			if (exclusiveStartKey) {
				queryParams.ExclusiveStartKey = exclusiveStartKey;
			}

			const result = await ddb.send(new QueryCommand(queryParams));
			let items = result.Items || [];
			lastKey = result.LastEvaluatedKey;

			// Check if there are more items
			hasMore = items.length > limitClamped;
			items = hasMore ? items.slice(0, -1) : items;
		}

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				items,
				count: items.length,
				hasMore,
				lastKey: lastKey ? encodeURIComponent(JSON.stringify(lastKey)) : null
			})
		};
	} catch (error: any) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to list clients', message: error.message })
		};
	}
});

