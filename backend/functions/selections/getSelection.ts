import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { verifyGalleryAccess } from '../../lib/src/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	if (!galleriesTable || !ordersTable) return { statusCode: 500, body: 'Missing tables' };
	const galleryId = event?.pathParameters?.id;
	if (!galleryId) return { statusCode: 400, body: 'missing galleryId' };

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };

	// Verify access - supports both owner (Cognito) and client (JWT) tokens
	const access = await verifyGalleryAccess(event, galleryId, gallery);
	if (!access.isOwner && !access.isClient) {
		return { statusCode: 401, body: 'Unauthorized. Please log in.' };
	}
	
	// Get pricing package from gallery (set by photographer per gallery)
	const pkg = gallery.pricingPackage as {
		includedCount?: number;
		extraPriceCents?: number;
		packageName?: string;
		packagePriceCents?: number;
		offerPhotoBook?: boolean;
		offerPhotoPrint?: boolean;
		photoBookCount?: number;
		photoPrintCount?: number;
	} | undefined;
	const ordersQuery = await ddb.send(new QueryCommand({
		TableName: ordersTable,
		KeyConditionExpression: 'galleryId = :g',
		ExpressionAttributeValues: {
			':g': galleryId
		}
	}));
	
	const orders = ordersQuery.Items || [];
	
	// Find active orders and check statuses in single pass
	const hasDeliveredOrder = orders.some((o: any) => o.deliveryStatus === 'DELIVERED');
	const clientSelectingOrder = orders.find((o: any) => o.deliveryStatus === 'CLIENT_SELECTING');
	const clientApprovedOrder = orders.find((o: any) => o.deliveryStatus === 'CLIENT_APPROVED');
	const preparingDeliveryOrder = orders.find((o: any) => o.deliveryStatus === 'PREPARING_DELIVERY');
	const changesRequestedOrder = orders.find((o: any) => o.deliveryStatus === 'CHANGES_REQUESTED');
	const activeOrder = clientSelectingOrder || clientApprovedOrder || preparingDeliveryOrder || changesRequestedOrder;
	
	// Can select photos only if: no order exists OR order status is CLIENT_SELECTING
	// PREPARING_DELIVERY locks selection (photographer already did the work)
	const canSelect = !activeOrder || !!clientSelectingOrder;
	
	// Order is "approved" if CLIENT_APPROVED or PREPARING_DELIVERY (photographer has done work)
	const isApproved = activeOrder && (activeOrder.deliveryStatus === 'CLIENT_APPROVED' || activeOrder.deliveryStatus === 'PREPARING_DELIVERY');
	
	// Pull selection from order if it exists, otherwise use defaults
	const selectedKeys = activeOrder?.selectedKeys || [];
	const photoBookKeys = activeOrder?.photoBookKeys || [];
	const photoPrintKeys = activeOrder?.photoPrintKeys || [];
	// Calculate selectedCount from selectedKeys.length to ensure consistency (selectedKeys is source of truth)
	const selectedKeysArray = Array.isArray(selectedKeys) ? selectedKeys : [];
	const photoBookKeysArray = Array.isArray(photoBookKeys) ? photoBookKeys : [];
	const photoPrintKeysArray = Array.isArray(photoPrintKeys) ? photoPrintKeys : [];
	const calculatedSelectedCount = selectedKeysArray.length;
	const selection = activeOrder ? {
		selectedKeys: selectedKeysArray,
		photoBookKeys: photoBookKeysArray,
		photoPrintKeys: photoPrintKeysArray,
		approved: isApproved,
		selectedCount: calculatedSelectedCount, // Use calculated count from selectedKeys, not stale DB value
		overageCount: activeOrder.overageCount || 0,
		overageCents: activeOrder.overageCents || 0
	} : { selectedKeys: [], photoBookKeys: [], photoPrintKeys: [], approved: false, selectedCount: 0, overageCount: 0, overageCents: 0 };
	
	// Can request changes if order is CLIENT_APPROVED or PREPARING_DELIVERY (photographer has done work)
	const canRequestChanges = !!(clientApprovedOrder || preparingDeliveryOrder);
	
	// Check if change requests are blocked for the active order
	const changeRequestsBlocked = canRequestChanges && (clientApprovedOrder?.changeRequestsBlocked === true || preparingDeliveryOrder?.changeRequestsBlocked === true);

	// Normalize pricingPackage so photoBookCount/photoPrintCount are always present for the gallery app.
	// Backward compat: if only legacy offerPhotoBook/offerPhotoPrint are set, derive counts from includedCount.
	const includedCount = pkg?.includedCount ?? 0;
	const basePkg = pkg || { includedCount: 0, extraPriceCents: 0, packagePriceCents: 0 };
	const photoBookCount =
		typeof (basePkg as any).photoBookCount === 'number'
			? (basePkg as any).photoBookCount
			: (basePkg as any).offerPhotoBook === true
				? includedCount
				: 0;
	const photoPrintCount =
		typeof (basePkg as any).photoPrintCount === 'number'
			? (basePkg as any).photoPrintCount
			: (basePkg as any).offerPhotoPrint === true
				? includedCount
				: 0;
	const pricingPackage = {
		...basePkg,
		includedCount,
		extraPriceCents: basePkg.extraPriceCents ?? 0,
		packagePriceCents: basePkg.packagePriceCents ?? 0,
		photoBookCount: Math.max(0, Math.min(photoBookCount, includedCount)),
		photoPrintCount: Math.max(0, Math.min(photoPrintCount, includedCount)),
	};

	// Include gallery-level status and pricing info
	const responseBody = {
		...selection,
		canSelect, // Simplified: true if no order or order is CLIENT_SELECTING
		changeRequestPending: !!changesRequestedOrder, // True if waiting for photographer approval
		hasClientApprovedOrder: canRequestChanges, // True if order is approved or preparing delivery (can request changes)
		changeRequestsBlocked: changeRequestsBlocked || false, // True if change requests are blocked for this order
		hasDeliveredOrder, // For showing processed photos view
		selectionEnabled: gallery.selectionEnabled !== false, // Gallery-level setting
		pricingPackage,
	};
	return { 
		statusCode: 200, 
		body: JSON.stringify(responseBody)
	};
});


