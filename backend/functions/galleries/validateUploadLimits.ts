import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { PRICING_PLANS, getPlanKeysSortedByStorage, calculatePriceWithDiscount, type PlanKey } from '../../lib/src/pricing';
import { recalculateStorageInternal } from './recalculateBytesUsed';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function getNextTierPlanForUpload(currentPlan: string | undefined, uploadedSizeBytes: number): PlanKey | null {
	if (!currentPlan) {
		// No plan yet, calculate best plan for uploaded size
		const plans = getPlanKeysSortedByStorage();
		for (const plan of plans) {
			if (PRICING_PLANS[plan].storageLimitBytes >= uploadedSizeBytes) {
				return plan;
			}
		}
		return plans[plans.length - 1]; // Return largest plan
	}

	// Extract current plan size and duration
	const currentPlanMetadata = PRICING_PLANS[currentPlan as PlanKey];
	if (!currentPlanMetadata) {
		return null;
	}

	const currentSize = currentPlanMetadata.storageLimitBytes;
	const currentDuration = currentPlan.includes('-1m') ? '1m' : currentPlan.includes('-3m') ? '3m' : '12m';

	// Find next tier with same duration
	const plansForDuration = getPlanKeysSortedByStorage()
		.filter(plan => plan.includes(`-${currentDuration}`));

	// Find next plan that fits the uploaded size
	for (const plan of plansForDuration) {
		if (PRICING_PLANS[plan].storageLimitBytes > currentSize && 
			PRICING_PLANS[plan].storageLimitBytes >= uploadedSizeBytes) {
			return plan;
		}
	}

	// If no plan in same duration fits, return largest plan for this duration
	return plansForDuration[plansForDuration.length - 1];
}

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

	// Parse request body to get optional upload size
	let pendingUploadSizeBytes = 0;
	try {
		if (event.body) {
			const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
			pendingUploadSizeBytes = body.uploadSizeBytes ?? 0;
		}
	} catch {
		// Ignore parsing errors, use default 0
	}

	// Enforce owner-only access
	const requester = getUserIdFromEvent(event);
	const galleryGet = await ddb.send(new GetCommand({ TableName: galleriesTable, Key: { galleryId } }));
	let gallery = galleryGet.Item as any;
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}
	requireOwnerOr403(gallery.ownerId, requester);

	// Trigger on-demand recalculation to ensure DB is accurate before validation
	// This is critical - user may have uploaded/deleted images just before checking limits
	// Then use the recalculated value (which comes from DynamoDB) to avoid duplicate queries
	let uploadedSizeBytes = gallery.originalsBytesUsed || 0;
	
	try {
		// Force immediate recalculation (bypasses cache) - critical for upload validation accuracy
		const imagesTable = envProc?.env?.IMAGES_TABLE as string;
		if (!imagesTable) {
			logger?.warn('IMAGES_TABLE not set, skipping recalculation before validation', { galleryId });
			return {
				statusCode: 500,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ error: 'Missing IMAGES_TABLE environment variable' })
			};
		}
		const recalcResult = await recalculateStorageInternal(galleryId, galleriesTable, imagesTable, gallery, logger, true);
		logger?.info('Triggered on-demand storage recalculation before validation', { galleryId });
		
		// Extract recalculated value from result
		if (recalcResult?.body) {
			try {
				const body = JSON.parse(recalcResult.body);
				if (body.originalsBytesUsed !== undefined) {
					uploadedSizeBytes = body.originalsBytesUsed;
					logger?.info('Using recalculated originalsBytesUsed from on-demand recalculation', {
						galleryId,
						originalsBytesUsed: uploadedSizeBytes
					});
				}
			} catch {
				// If parsing fails, re-fetch gallery to get updated bytes
				const updatedGalleryGet = await ddb.send(new GetCommand({
					TableName: galleriesTable,
					Key: { galleryId }
				}));
				if (updatedGalleryGet.Item) {
					gallery = updatedGalleryGet.Item;
					uploadedSizeBytes = updatedGalleryGet.Item.originalsBytesUsed || 0;
				}
			}
		} else {
			// Re-fetch gallery to get updated bytes
			const updatedGalleryGet = await ddb.send(new GetCommand({
				TableName: galleriesTable,
				Key: { galleryId }
			}));
			if (updatedGalleryGet.Item) {
				gallery = updatedGalleryGet.Item;
				uploadedSizeBytes = updatedGalleryGet.Item.originalsBytesUsed || 0;
			}
		}
	} catch (recalcErr: any) {
		logger?.warn('Failed to recalculate storage before validation, using stored total', {
			error: recalcErr.message,
			galleryId
		});
		// Fallback: Use stored total if recalculation fails (should be accurate from atomic operations)
		uploadedSizeBytes = gallery.originalsBytesUsed || 0;
	}
	
	// Calculate projected usage (current + upload size)
	const projectedUsage = uploadedSizeBytes + pendingUploadSizeBytes;
	logger?.info('Validated upload limits', { galleryId, uploadedSizeBytes, pendingUploadSizeBytes, projectedUsage });

	// Check if gallery has plan and limits
	const originalsLimitBytes = gallery.originalsLimitBytes;
	
	if (!originalsLimitBytes) {
		// No plan set yet - this is expected for draft galleries
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				withinLimit: true,
				uploadedSizeBytes,
				message: 'No plan set yet - plan will be calculated after upload'
			})
		};
	}

	// Check if limit would be exceeded with the upload
	const wouldExceedLimit = projectedUsage > originalsLimitBytes;
	const excessBytes = wouldExceedLimit ? projectedUsage - originalsLimitBytes : 0;

	if (!wouldExceedLimit) {
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				withinLimit: true,
				uploadedSizeBytes: projectedUsage,
				originalsLimitBytes,
				usedPercentage: (projectedUsage / originalsLimitBytes) * 100
			})
		};
	}

	// Limit would be exceeded - calculate next tier plan based on projected usage
	const currentPlan = gallery.plan;
	const nextTierPlan = getNextTierPlanForUpload(currentPlan, projectedUsage);
	const nextTierMetadata = nextTierPlan ? PRICING_PLANS[nextTierPlan] : null;

	// Calculate pricing for next tier
	const isSelectionGallery = gallery.selectionEnabled !== false;
	const nextTierPriceCents = nextTierPlan ? calculatePriceWithDiscount(nextTierPlan, isSelectionGallery) : 0;

	return {
		statusCode: 400,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			withinLimit: false,
			error: 'Storage limit would be exceeded',
			uploadedSizeBytes: projectedUsage,
			originalsLimitBytes,
			excessBytes,
			usedPercentage: (projectedUsage / originalsLimitBytes) * 100,
			nextTierPlan: nextTierPlan as string,
			nextTierPriceCents,
			nextTierLimitBytes: nextTierMetadata?.storageLimitBytes || 0,
			isSelectionGallery
		})
	};
});

