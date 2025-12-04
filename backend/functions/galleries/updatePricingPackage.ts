import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const table = envProc?.env?.GALLERIES_TABLE as string;
	if (!table) return { statusCode: 500, body: 'Missing table' };
	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: 'missing id' };
	const body = event?.body ? JSON.parse(event.body) : {};
	const pkg = body?.pricingPackage;
	if (!pkg || 
		(pkg.packageName !== undefined && typeof pkg.packageName !== 'string') ||
		typeof pkg.includedCount !== 'number' || 
		typeof pkg.extraPriceCents !== 'number' || 
		typeof pkg.packagePriceCents !== 'number') {
		return { statusCode: 400, body: 'pricingPackage requires { packageName?: string, includedCount: number, extraPriceCents: number, packagePriceCents: number }' };
	}
	
	// Package name is optional - use provided name or undefined
	const packageName = (pkg.packageName && pkg.packageName.trim()) ? pkg.packageName.trim() : undefined;
	const requester = getUserIdFromEvent(event);
	const got = await ddb.send(new GetCommand({ TableName: table, Key: { galleryId: id } }));
	const gallery = got.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	requireOwnerOr403(gallery.ownerId, requester);
	
	// Check if pricing package can be updated
	// Allow update if:
	// 1. Selection is not approved (no CLIENT_APPROVED or PREPARING_DELIVERY order), OR
	// 2. Change request is pending (photographer can adjust pricing when approving change request)
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	let hasApprovedOrder = false;
	let changeRequestPending = false;
	
	if (ordersTable) {
		const ordersQuery = await ddb.send(new QueryCommand({
			TableName: ordersTable,
			KeyConditionExpression: 'galleryId = :g',
			ExpressionAttributeValues: { ':g': id }
		}));
		const orders = ordersQuery.Items || [];
		// PREPARING_DELIVERY also locks pricing (photographer has done work)
		hasApprovedOrder = orders.some((o: any) => 
			o.deliveryStatus === 'CLIENT_APPROVED' || o.deliveryStatus === 'PREPARING_DELIVERY'
		);
		changeRequestPending = orders.some((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
	}
	
	if (hasApprovedOrder && !changeRequestPending) {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Cannot update pricing package: Selection is approved and no change request is pending. Client must request changes first.' 
			})
		};
	}

	// Build pricingPackage object - only include packageName if it exists
	const pricingPackageUpdate: {
		packageName?: string;
		includedCount: number;
		extraPriceCents: number;
		packagePriceCents: number;
	} = {
		includedCount: pkg.includedCount,
		extraPriceCents: pkg.extraPriceCents,
		packagePriceCents: pkg.packagePriceCents,
	};
	if (packageName !== undefined) {
		pricingPackageUpdate.packageName = packageName;
	}

	await ddb.send(new UpdateCommand({
		TableName: table,
		Key: { galleryId: id },
		UpdateExpression: 'SET pricingPackage = :p, updatedAt = :u',
		ExpressionAttributeValues: {
			':p': pricingPackageUpdate,
			':u': new Date().toISOString()
		}
	}));

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ galleryId: id, pricingPackage: pkg })
	};
});

