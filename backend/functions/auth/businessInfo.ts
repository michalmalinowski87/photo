import { lambdaLogger } from '../../../packages/logger/src';
import { getUserIdFromEvent } from '../../lib/src/auth';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const usersTable = envProc?.env?.USERS_TABLE as string;

	if (!usersTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing USERS_TABLE configuration' })
		};
	}

	const userId = getUserIdFromEvent(event);
	if (!userId) {
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Unauthorized' })
		};
	}

	// Handle GET request
	if (event.httpMethod === 'GET' || event.requestContext?.http?.method === 'GET') {
		try {
			const result = await ddb.send(new GetCommand({
				TableName: usersTable,
				Key: { userId }
			}));

			const userData = result.Item || {};
			const businessInfo = {
				businessName: userData.businessName || '',
				email: userData.contactEmail || '',
				phone: userData.phone || '',
				address: userData.address || '',
				nip: userData.nip || ''
			};

			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(businessInfo)
			};
		} catch (error: any) {
			logger?.error('Get business info failed', {
				error: {
					name: error.name,
					message: error.message
				},
				userId
			});

			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Failed to get business information', message: error.message })
			};
		}
	}

	// Handle PUT request
	const body = event?.body ? JSON.parse(event.body) : {};
	const { businessName, email, phone, address, nip } = body;

	// Validate email format if provided
	if (email !== undefined && email !== '' && email !== null) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return {
				statusCode: 400,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Invalid email format' })
			};
		}
	}

	// Get existing user data to merge updates
	let existingData: any = {};
	try {
		const getResult = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId }
		}));
		existingData = getResult.Item || {};
	} catch (err) {
		// If user doesn't exist yet, that's fine - we'll create a new record
		logger?.info('User record not found, creating new', { userId });
	}

	// Build update object - only include fields that are provided
	const updateData: any = {
		userId,
		updatedAt: new Date().toISOString()
	};

	if (businessName !== undefined) {
		updateData.businessName = String(businessName).trim() || '';
	} else if (existingData.businessName !== undefined) {
		updateData.businessName = existingData.businessName;
	}

	if (email !== undefined) {
		updateData.contactEmail = email !== null && email !== '' ? email.trim().toLowerCase() : '';
	} else if (existingData.contactEmail !== undefined) {
		updateData.contactEmail = existingData.contactEmail;
	}

	if (phone !== undefined) {
		updateData.phone = String(phone).trim() || '';
	} else if (existingData.phone !== undefined) {
		updateData.phone = existingData.phone;
	}

	if (address !== undefined) {
		updateData.address = String(address).trim() || '';
	} else if (existingData.address !== undefined) {
		updateData.address = existingData.address;
	}

	if (nip !== undefined) {
		updateData.nip = String(nip).trim() || '';
	} else if (existingData.nip !== undefined) {
		updateData.nip = existingData.nip;
	}

	// Set createdAt if this is a new record
	if (!existingData.createdAt) {
		updateData.createdAt = updateData.updatedAt;
	}

	try {
		await ddb.send(new PutCommand({
			TableName: usersTable,
			Item: updateData
		}));

		logger?.info('Business info updated successfully', { userId });

		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'Business information updated successfully' })
		};
	} catch (error: any) {
		logger?.error('Update business info failed', {
			error: {
				name: error.name,
				message: error.message
			},
			userId
		});

		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Failed to update business information', message: error.message })
		};
	}
});
