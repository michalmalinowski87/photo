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
	
	// Get current pricing package to preserve values when only limited updates are allowed
	const currentPricingPackage = gallery.pricingPackage as
		| {
				packageName?: string;
				includedCount?: number;
				extraPriceCents?: number;
				packagePriceCents?: number;
				photoBookCount?: number;
				photoPrintCount?: number;
		  }
		| undefined;

	// When approved order exists (CLIENT_APPROVED/PREPARING_DELIVERY) or only DELIVERED orders exist,
	// allow only extraPriceCents (price per additional photo) to be updated.
	const onlyExtraPriceAllowed =
		(hasApprovedOrder && !changeRequestPending) ||
		(hasDeliveredOrders && !hasApprovedOrder);

	if (onlyExtraPriceAllowed) {
		// Verify that only extraPriceCents is being changed
		const currentExtraPrice = currentPricingPackage?.extraPriceCents ?? 0;
		const newExtraPrice = pkg.extraPriceCents;
		const extraPriceChanged = newExtraPrice !== currentExtraPrice;

		// Check if any other fields are being changed
		const currentIncludedCount = currentPricingPackage?.includedCount ?? 0;
		const currentPackagePrice = currentPricingPackage?.packagePriceCents ?? 0;
		const currentPackageName = currentPricingPackage?.packageName;
		const currentPhotoBookCount = currentPricingPackage?.photoBookCount ?? 0;
		const currentPhotoPrintCount = currentPricingPackage?.photoPrintCount ?? 0;

		const includedCountChanged = pkg.includedCount !== currentIncludedCount;
		const packagePriceChanged = pkg.packagePriceCents !== currentPackagePrice;
		const packageNameChanged = packageName !== undefined && packageName !== currentPackageName;
		// Treat missing optional fields as unchanged (frontend locked path may omit photoBookCount/photoPrintCount)
		const photoBookCountChanged = (pkg.photoBookCount ?? currentPhotoBookCount) !== currentPhotoBookCount;
		const photoPrintCountChanged = (pkg.photoPrintCount ?? currentPhotoPrintCount) !== currentPhotoPrintCount;

		if (includedCountChanged || packagePriceChanged || packageNameChanged || photoBookCountChanged || photoPrintCountChanged) {
			return {
				statusCode: 403,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					error: 'Cannot update pricing package: Gallery has approved or delivered orders. Only the price for additional photos (extraPriceCents) can be updated.'
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
		const pricingPackageUpdate: Record<string, unknown> = {
			includedCount: currentIncludedCount,
			extraPriceCents: newExtraPrice,
			packagePriceCents: currentPackagePrice,
		};
		if (currentPackageName !== undefined) {
			pricingPackageUpdate.packageName = currentPackageName;
		}
		pricingPackageUpdate.photoBookCount = currentPricingPackage?.photoBookCount ?? 0;
		pricingPackageUpdate.photoPrintCount = currentPricingPackage?.photoPrintCount ?? 0;

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

	// Normalize photo book / photo print counts
	const cap = pkg.includedCount;
	const bookCount = typeof pkg.photoBookCount === 'number' ? Math.max(0, Math.min(pkg.photoBookCount, cap)) : 0;
	const printCount = typeof pkg.photoPrintCount === 'number' ? Math.max(0, Math.min(pkg.photoPrintCount, cap)) : 0;

	// Build pricingPackage object - only include packageName if it exists
	// Full update allowed when no delivered/approved orders exist
	const pricingPackageUpdate: Record<string, unknown> = {
		includedCount: pkg.includedCount,
		extraPriceCents: pkg.extraPriceCents,
		packagePriceCents: pkg.packagePriceCents,
		photoBookCount: bookCount,
		photoPrintCount: printCount,
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
		body: JSON.stringify({ galleryId: id, pricingPackage: pricingPackageUpdate })
	};
});

