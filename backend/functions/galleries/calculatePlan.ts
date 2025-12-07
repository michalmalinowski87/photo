import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { PRICING_PLANS, calculateBestPlan, getPlanKeysSortedByStorage, getNextTierPlan, calculatePriceWithDiscount, getLargestPlanSize, type PlanKey } from '../../lib/src/pricing';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// calculateBestPlan is now imported from pricing module

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const bucket = envProc?.env?.GALLERIES_BUCKET as string;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;

	if (!galleriesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing required environment variables' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing galleryId' })
		};
	}

	// Get duration preference from query string (default to 1m)
	const duration = event?.queryStringParameters?.duration || '1m';
	if (!['1m', '3m', '12m'].includes(duration)) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Invalid duration. Must be 1m, 3m, or 12m' })
		};
	}

	// Enforce owner-only access
	const requester = getUserIdFromEvent(event);
	const galleryGet = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	const gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}
	requireOwnerOr403(gallery.ownerId, requester);

	// Use stored total (maintained via atomic operations during uploads/deletes)
	const uploadedSizeBytes = gallery.originalsBytesUsed || 0;
	logger?.info('Using stored uploaded size', { galleryId, uploadedSizeBytes });

	// Find best matching plan
	const suggestedPlan = calculateBestPlan(uploadedSizeBytes, duration as '1m' | '3m' | '12m');
	const planMetadata = PRICING_PLANS[suggestedPlan];

	// Calculate pricing based on gallery type
	const isSelectionGallery = gallery.selectionEnabled !== false;
	const priceCents = calculatePriceWithDiscount(suggestedPlan, isSelectionGallery);

	// Both types: originalsLimitBytes = plan size, finalsLimitBytes = plan size
	const originalsLimitBytes = planMetadata.storageLimitBytes;
	const finalsLimitBytes = planMetadata.storageLimitBytes;

	// Format suggested plan as object for frontend
	const suggestedPlanObj = {
		name: planMetadata.label,
		priceCents: priceCents,
		storage: planMetadata.storage,
		duration: planMetadata.duration,
		planKey: suggestedPlan
	};

	// USER-CENTRIC FIX #1: Check if uploaded size is at/near capacity
	const usagePercentage = (uploadedSizeBytes / originalsLimitBytes) * 100;
	const isNearCapacity = usagePercentage >= 95;
	const isAtCapacity = usagePercentage >= 99.9;
	
	// USER-CENTRIC FIX #4: Check if uploaded size exceeds largest plan
	const MAX_PLAN_SIZE = getLargestPlanSize();
	const exceedsLargestPlan = uploadedSizeBytes > MAX_PLAN_SIZE;
	
	// Calculate next tier plan if near/at capacity
	let nextTierPlan: any = null;
	if (isNearCapacity || isAtCapacity) {
		const nextTierPlanKey = getNextTierPlan(suggestedPlan);
		if (nextTierPlanKey) {
			const nextTierMetadata = PRICING_PLANS[nextTierPlanKey];
			const nextTierPriceCents = calculatePriceWithDiscount(nextTierPlanKey, isSelectionGallery);
			nextTierPlan = {
				planKey: nextTierPlanKey,
				name: nextTierMetadata.label,
				priceCents: nextTierPriceCents,
				storageLimitBytes: nextTierMetadata.storageLimitBytes,
				storage: nextTierMetadata.storage
			};
		}
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			suggestedPlan: suggestedPlanObj,
			priceCents,
			originalsLimitBytes,
			finalsLimitBytes,
			expiryDays: planMetadata.expiryDays,
			uploadedSizeBytes,
			selectionEnabled: isSelectionGallery,
			usagePercentage,
			isNearCapacity,
			isAtCapacity,
			exceedsLargestPlan,
			nextTierPlan,
			planOptions: {
				'1m': calculateBestPlan(uploadedSizeBytes, '1m') as string,
				'3m': calculateBestPlan(uploadedSizeBytes, '3m') as string,
				'12m': calculateBestPlan(uploadedSizeBytes, '12m') as string
			}
		})
	};
});

