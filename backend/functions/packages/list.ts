import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { createLambdaErrorResponse } from '../../lib/src/error-utils';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const packagesTable = envProc?.env?.PACKAGES_TABLE as string;
	
	if (!packagesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing PACKAGES_TABLE environment variable' })
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

	// Parse pagination parameters
	const limitParam = event?.queryStringParameters?.limit;
	const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20; // Default 20, max 100
	const cursorParam = event?.queryStringParameters?.cursor;
	
	// Parse search and sort parameters
	const search = event?.queryStringParameters?.search?.trim() || '';
	const sortBy = event?.queryStringParameters?.sortBy || 'date'; // name, price, pricePerExtraPhoto, date
	const sortOrder = event?.queryStringParameters?.sortOrder || 'desc'; // asc, desc

	try {
		// OPTIMIZATION: Use pagination at DynamoDB level when possible
		// For date sorting without search, we can use DynamoDB's native sorting
		const needsAllItems = search || (sortBy !== 'date');
		let allItems: any[] = [];
		let lastEvaluatedKey: Record<string, any> | undefined;

		if (!needsAllItems && !cursorParam) {
			// OPTIMIZATION: For date sorting without search, use pagination at DynamoDB level
			const queryParams: any = {
				TableName: packagesTable,
				IndexName: 'ownerId-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				},
				ScanIndexForward: sortOrder === 'asc', // DynamoDB sorts by createdAt
				Limit: limit + 1
			};

			const result = await ddb.send(new QueryCommand(queryParams));
			const items = result.Items || [];
			const hasMore = items.length > limit;
			const paginatedItems = hasMore ? items.slice(0, -1) : items;
			const nextLastKey = result.LastEvaluatedKey;

			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					items: paginatedItems,
					hasMore,
					nextCursor: hasMore && nextLastKey ? encodeURIComponent(JSON.stringify(nextLastKey)) : null,
					count: paginatedItems.length
				})
			};
		}

		// For search or non-date sorting, fetch all items (with safety limit)
		const MAX_ITEMS_TO_FETCH = 1000; // Safety limit to prevent timeouts
		let fetchedCount = 0;

		do {
			const queryParams: any = {
				TableName: packagesTable,
				IndexName: 'ownerId-index',
				KeyConditionExpression: 'ownerId = :o',
				ExpressionAttributeValues: {
					':o': ownerId
				},
				ScanIndexForward: false, // Newest first by default
				Limit: 100 // Fetch in chunks
			};

			if (lastEvaluatedKey) {
				queryParams.ExclusiveStartKey = lastEvaluatedKey;
			}

			const result = await ddb.send(new QueryCommand(queryParams));
			const items = result.Items || [];
			allItems = allItems.concat(items);
			lastEvaluatedKey = result.LastEvaluatedKey;
			fetchedCount += items.length;
			
			// Safety limit to prevent timeouts
			if (fetchedCount >= MAX_ITEMS_TO_FETCH) {
				break;
			}
		} while (lastEvaluatedKey);

		// Apply search filter
		let filteredItems = allItems;
		if (search) {
			const searchLower = search.toLowerCase();
			filteredItems = allItems.filter((item) => {
				const name = (item.name || '').toLowerCase();
				return name.includes(searchLower);
			});
		}

		// Apply sorting
		let sortedItems = filteredItems;
		if (sortBy === 'name') {
			sortedItems = [...filteredItems].sort((a, b) => {
				const nameA = (a.name || '').toLowerCase();
				const nameB = (b.name || '').toLowerCase();
				return sortOrder === 'asc' 
					? nameA.localeCompare(nameB)
					: nameB.localeCompare(nameA);
			});
		} else if (sortBy === 'price') {
			sortedItems = [...filteredItems].sort((a, b) => {
				const priceA = a.price || 0;
				const priceB = b.price || 0;
				return sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
			});
		} else if (sortBy === 'pricePerExtraPhoto') {
			sortedItems = [...filteredItems].sort((a, b) => {
				const priceA = a.pricePerExtraPhoto || 0;
				const priceB = b.pricePerExtraPhoto || 0;
				return sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
			});
		} else if (sortBy === 'date') {
			// Already sorted by date from DynamoDB (newest first), just reverse if needed
			if (sortOrder === 'asc') {
				sortedItems = [...filteredItems].reverse();
			}
		}

		// Apply pagination - cursor is an offset index for the sorted/filtered results
		const startIndex = cursorParam ? parseInt(cursorParam, 10) || 0 : 0;
		if (isNaN(startIndex) || startIndex < 0) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Invalid cursor parameter' })
			};
		}
		const endIndex = startIndex + limit;
		const paginatedItems = sortedItems.slice(startIndex, endIndex);
		const hasMore = endIndex < sortedItems.length;
		const nextCursor = hasMore ? endIndex.toString() : null;

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				items: paginatedItems,
				hasMore,
				nextCursor,
				count: paginatedItems.length
			})
		};
	} catch (error: any) {
		const logger = (context as any).logger;
		logger?.error('List packages failed', {
			userId: requester,
			errorName: error.name,
			errorMessage: error.message
		}, error);
		return createLambdaErrorResponse(error, 'Failed to list packages', 500);
	}
});

