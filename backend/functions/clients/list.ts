import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

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

	const limitParam = event?.queryStringParameters?.limit;
	const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20; // Default 20, max 100
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
	
	// Parse sort parameters
	const sortByParam = event?.queryStringParameters?.sortBy || 'date';
	const sortBy = ['name', 'date'].includes(sortByParam) ? sortByParam : 'date';
	const sortOrderParam = event?.queryStringParameters?.sortOrder || 'desc';
	const sortOrder = ['asc', 'desc'].includes(sortOrderParam) ? sortOrderParam : 'desc';

	try {
		let allItems: any[] = [];
		let lastKey: Record<string, any> | undefined;
		let hasMore = false;
		let items: any[] = [];

		if (searchQuery) {
			// OPTIMIZATION: For search, fetch all items (up to reasonable limit) and filter
			// Then paginate through filtered results
			const MAX_ITEMS_TO_FETCH = 1000; // Safety limit
			let fetchedCount = 0;
			let lastEvaluatedKey: Record<string, any> | undefined = exclusiveStartKey;
			
			do {
				const queryParams: any = {
					TableName: clientsTable,
					IndexName: 'ownerId-index',
					KeyConditionExpression: 'ownerId = :o',
					ExpressionAttributeValues: {
						':o': ownerId
					},
					ScanIndexForward: false,
					Limit: 100 // Fetch in chunks
				};

				if (lastEvaluatedKey) {
					queryParams.ExclusiveStartKey = lastEvaluatedKey;
				}

				const result = await ddb.send(new QueryCommand(queryParams));
				const batchItems = result.Items || [];
				allItems = allItems.concat(batchItems);
				lastEvaluatedKey = result.LastEvaluatedKey;
				fetchedCount += batchItems.length;
				
				// Safety limit to prevent timeouts
				if (fetchedCount >= MAX_ITEMS_TO_FETCH) {
					break;
				}
			} while (lastEvaluatedKey);

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

			// Sort filtered items
			allItems.sort((a: any, b: any) => {
				let comparison = 0;
				
				if (sortBy === 'name') {
					// For companies, use companyName; for individuals, use firstName + lastName
					const nameA = a.isCompany 
						? (a.companyName || '').toLowerCase()
						: `${(a.firstName || '')} ${(a.lastName || '')}`.trim().toLowerCase();
					const nameB = b.isCompany
						? (b.companyName || '').toLowerCase()
						: `${(b.firstName || '')} ${(b.lastName || '')}`.trim().toLowerCase();
					comparison = nameA.localeCompare(nameB);
				} else {
					// Default: sort by date (createdAt)
					const timeA = new Date(a.createdAt || 0).getTime();
					const timeB = new Date(b.createdAt || 0).getTime();
					comparison = timeA - timeB;
				}
				
				return sortOrder === 'asc' ? comparison : -comparison;
			});
			
			// Apply pagination to filtered results
			const startIndex = pageOffset;
			const endIndex = startIndex + limit;
			hasMore = endIndex < allItems.length;
			items = allItems.slice(startIndex, endIndex);
			
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
			// OPTIMIZATION: For non-search queries, use pagination at DynamoDB level when possible
			// If sorting by date (default), we can use DynamoDB's native sorting
			if (sortBy === 'date') {
				const queryParams: any = {
					TableName: clientsTable,
					IndexName: 'ownerId-index',
					KeyConditionExpression: 'ownerId = :o',
					ExpressionAttributeValues: {
						':o': ownerId
					},
					ScanIndexForward: sortOrder === 'asc', // DynamoDB sorts by createdAt
					Limit: limit + 1
				};

				if (exclusiveStartKey) {
					queryParams.ExclusiveStartKey = exclusiveStartKey;
				}

				const result = await ddb.send(new QueryCommand(queryParams));
				items = result.Items || [];
				lastKey = result.LastEvaluatedKey;

				// Check if there are more items
				hasMore = items.length > limit;
				items = hasMore ? items.slice(0, -1) : items;
			} else {
				// For name sorting, we need to fetch all items and sort
				// But limit to reasonable amount to prevent timeouts
				const MAX_ITEMS_TO_FETCH = 1000; // Safety limit
				let fetchedCount = 0;
				let lastEvaluatedKey: Record<string, any> | undefined = exclusiveStartKey;
				
				do {
					const queryParams: any = {
						TableName: clientsTable,
						IndexName: 'ownerId-index',
						KeyConditionExpression: 'ownerId = :o',
						ExpressionAttributeValues: {
							':o': ownerId
						},
						ScanIndexForward: false,
						Limit: 100 // Fetch in chunks
					};

					if (lastEvaluatedKey) {
						queryParams.ExclusiveStartKey = lastEvaluatedKey;
					}

					const result = await ddb.send(new QueryCommand(queryParams));
					const batchItems = result.Items || [];
					allItems = allItems.concat(batchItems);
					lastEvaluatedKey = result.LastEvaluatedKey;
					fetchedCount += batchItems.length;
					
					// Safety limit to prevent timeouts
					if (fetchedCount >= MAX_ITEMS_TO_FETCH) {
						lastKey = lastEvaluatedKey; // Save for pagination
						break;
					}
				} while (lastEvaluatedKey);
				
				// Sort items
				allItems.sort((a: any, b: any) => {
					let comparison = 0;
					
					if (sortBy === 'name') {
						// For companies, use companyName; for individuals, use firstName + lastName
						const nameA = a.isCompany 
							? (a.companyName || '').toLowerCase()
							: `${(a.firstName || '')} ${(a.lastName || '')}`.trim().toLowerCase();
						const nameB = b.isCompany
							? (b.companyName || '').toLowerCase()
							: `${(b.firstName || '')} ${(b.lastName || '')}`.trim().toLowerCase();
						comparison = nameA.localeCompare(nameB);
					} else {
						// Default: sort by date (createdAt)
						const timeA = new Date(a.createdAt || 0).getTime();
						const timeB = new Date(b.createdAt || 0).getTime();
						comparison = timeA - timeB;
					}
					
					return sortOrder === 'asc' ? comparison : -comparison;
				});
				
				// Apply pagination
				items = allItems.slice(0, limit);
				hasMore = allItems.length > limit;
			}
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
		console.error('List clients failed:', error);
		return createLambdaErrorResponse(error, 'Failed to list clients', 500);
	}
});

