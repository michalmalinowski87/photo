import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getJWTFromEvent } from '../../lib/src/jwt';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any) => {
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const ordersTable = envProc?.env?.ORDERS_TABLE as string;
	if (!galleriesTable || !ordersTable) return { statusCode: 500, body: 'Missing tables' };
	const galleryId = event?.pathParameters?.id;
	if (!galleryId) return { statusCode: 400, body: 'missing galleryId' };

	// Verify JWT token - get clientId from token, not URL
	const jwtPayload = getJWTFromEvent(event);
	if (!jwtPayload || jwtPayload.galleryId !== galleryId) {
		return { statusCode: 401, body: 'Unauthorized. Please log in.' };
	}
	const clientId = jwtPayload.clientId;
	if (!clientId) {
		return { statusCode: 401, body: 'Invalid token. Missing clientId.' };
	}

	const g = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = g.Item as any;
	if (!gallery) return { statusCode: 404, body: 'not found' };
	
	// Get pricing package from gallery (set by photographer per gallery)
	const pkg = gallery.pricingPackage as { includedCount?: number; extraPriceCents?: number; packageName?: string; packagePriceCents?: number } | undefined;
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
	const selection = activeOrder ? {
		selectedKeys: activeOrder.selectedKeys || [],
		approved: isApproved,
		selectedCount: activeOrder.selectedCount || 0,
		overageCount: activeOrder.overageCount || 0,
		overageCents: activeOrder.overageCents || 0
	} : { selectedKeys: [], approved: false, selectedCount: 0, overageCount: 0, overageCents: 0 };
	
	// Can request changes if order is CLIENT_APPROVED or PREPARING_DELIVERY (photographer has done work)
	const canRequestChanges = !!(clientApprovedOrder || preparingDeliveryOrder);
	
	// Include gallery-level status and pricing info
	return { 
		statusCode: 200, 
		body: JSON.stringify({
			...selection,
			canSelect, // Simplified: true if no order or order is CLIENT_SELECTING
			changeRequestPending: !!changesRequestedOrder, // True if waiting for photographer approval
			hasClientApprovedOrder: canRequestChanges, // True if order is approved or preparing delivery (can request changes)
			hasDeliveredOrder, // For showing processed photos view
			selectionEnabled: gallery.selectionEnabled !== false, // Gallery-level setting
			pricingPackage: pkg || { includedCount: 0, extraPriceCents: 0, packageName: '', packagePriceCents: 0 }
		})
	};
});


