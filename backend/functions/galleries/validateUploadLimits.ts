import { lambdaLogger } from '../../../packages/logger/src';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { PRICING_PLANS, getPlanKeysSortedByStorage, calculatePriceWithDiscount, type PlanKey } from '../../lib/src/pricing';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function calculateOriginalsSize(bucket: string, galleryId: string): Promise<number> {
	let totalSize = 0;
	let continuationToken: string | undefined;
	const prefix = `galleries/${galleryId}/originals/`;

	do {
		const listResponse = await s3.send(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefix,
			ContinuationToken: continuationToken
		}));

		if (listResponse.Contents) {
			totalSize += listResponse.Contents.reduce((sum, obj) => sum + (obj.Size || 0), 0);
		}

		continuationToken = listResponse.NextContinuationToken;
	} while (continuationToken);

	return totalSize;
}

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

	if (!bucket || !galleriesTable) {
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

	// Calculate actual gallery size from S3
	const uploadedSizeBytes = await calculateOriginalsSize(bucket, galleryId);
	logger?.info('Validated upload limits', { galleryId, uploadedSizeBytes });

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

	// Check if limit is exceeded
	const isExceeded = uploadedSizeBytes > originalsLimitBytes;
	const excessBytes = isExceeded ? uploadedSizeBytes - originalsLimitBytes : 0;

	if (!isExceeded) {
		return {
			statusCode: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				withinLimit: true,
				uploadedSizeBytes,
				originalsLimitBytes,
				usedPercentage: (uploadedSizeBytes / originalsLimitBytes) * 100
			})
		};
	}

	// Limit exceeded - calculate next tier plan
	const currentPlan = gallery.plan;
	const nextTierPlan = getNextTierPlanForUpload(currentPlan, uploadedSizeBytes);
	const nextTierMetadata = nextTierPlan ? PRICING_PLANS[nextTierPlan] : null;

	// Calculate pricing for next tier
	const isSelectionGallery = gallery.selectionEnabled !== false;
	const nextTierPriceCents = nextTierPlan ? calculatePriceWithDiscount(nextTierPlan, isSelectionGallery) : 0;

	return {
		statusCode: 400,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			withinLimit: false,
			error: 'Storage limit exceeded',
			uploadedSizeBytes,
			originalsLimitBytes,
			excessBytes,
			usedPercentage: (uploadedSizeBytes / originalsLimitBytes) * 100,
			nextTierPlan: nextTierPlan as string,
			nextTierPriceCents,
			nextTierLimitBytes: nextTierMetadata?.storageLimitBytes || 0,
			isSelectionGallery
		})
	};
});

