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
	// 3. Only DELIVERED orders exist (allow updating extraPriceCents only for future purchases)
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	let hasApprovedOrder = false;
	let changeRequestPending = false;
	let hasDeliveredOrders = false;
	
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
		hasDeliveredOrders = orders.some((o: any) => o.deliveryStatus === 'DELIVERED');
	}
	
	// Block all updates if CLIENT_APPROVED or PREPARING_DELIVERY orders exist (unless change request is pending)
	if (hasApprovedOrder && !changeRequestPending) {
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Cannot update pricing package: Selection is approved and no change request is pending. Client must request changes first.' 
			})
		};
	}

	// Get current pricing package to preserve values when only DELIVERED orders exist
	const currentPricingPackage = gallery.pricingPackage as
		| {
				packageName?: string;
				includedCount?: number;
				extraPriceCents?: number;
				packagePriceCents?: number;
		  }
		| undefined;

	// If only DELIVERED orders exist (no CLIENT_APPROVED/PREPARING_DELIVERY), only allow updating extraPriceCents
	// This allows adjusting price for future "buy more" purchases without affecting delivered orders
	if (hasDeliveredOrders && !hasApprovedOrder) {
		// Verify that only extraPriceCents is being changed
		const currentExtraPrice = currentPricingPackage?.extraPriceCents ?? 0;
		const newExtraPrice = pkg.extraPriceCents;
		const extraPriceChanged = newExtraPrice !== currentExtraPrice;

		// Check if any other fields are being changed
		const currentIncludedCount = currentPricingPackage?.includedCount ?? 0;
		const currentPackagePrice = currentPricingPackage?.packagePriceCents ?? 0;
		const currentPackageName = currentPricingPackage?.packageName;
		
		const includedCountChanged = pkg.includedCount !== currentIncludedCount;
		const packagePriceChanged = pkg.packagePriceCents !== currentPackagePrice;
		const packageNameChanged = packageName !== undefined && packageName !== currentPackageName;

		if (includedCountChanged || packagePriceChanged || packageNameChanged) {
			return {
				statusCode: 403,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ 
					error: 'Cannot update pricing package: Gallery has delivered orders. Only the price for additional photos (extraPriceCents) can be updated.' 
				})
			};
		}

		// If extraPriceCents hasn't changed, no update needed
		if (!extraPriceChanged) {
			return {
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ galleryId: id, pricingPackage: currentPricingPackage })
			};
		}

		// Build pricingPackage update preserving all fields except extraPriceCents
		const pricingPackageUpdate: {
			packageName?: string;
			includedCount: number;
			extraPriceCents: number;
			packagePriceCents: number;
		} = {
			includedCount: currentIncludedCount,
			extraPriceCents: newExtraPrice,
			packagePriceCents: currentPackagePrice,
		};
		if (currentPackageName !== undefined) {
			pricingPackageUpdate.packageName = currentPackageName;
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
			body: JSON.stringify({ galleryId: id, pricingPackage: pricingPackageUpdate })
		};
	}

	// Build pricingPackage object - only include packageName if it exists
	// Full update allowed when no delivered/approved orders exist
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

