import { lambdaLogger } from '../../../packages/logger/src';
import { ddbGet } from '../../lib/src/ddb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';

export const handler = lambdaLogger(async (event: any) => {
	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: 'missing id' };
	const envProc = (globalThis as any).process;
	const tableName = envProc && envProc.env ? (envProc.env.GALLERIES_TABLE as string) : '';
	const gallery = await ddbGet<any>(tableName, { galleryId: id });
	if (!gallery) {
		return { statusCode: 404, body: JSON.stringify({ error: 'not found' }) };
	}
	const requesterId = getUserIdFromEvent(event);
	requireOwnerOr403(gallery.ownerId, requesterId);
	
	// Derive payment status from transactions
	let isPaid = false;
	let paymentStatus = 'UNPAID';
	try {
		const paidTransaction = await getPaidTransactionForGallery(id);
		isPaid = !!paidTransaction;
		paymentStatus = isPaid ? 'PAID' : 'UNPAID';
	} catch (err) {
		// If transaction check fails, fall back to gallery state
		isPaid = gallery.state === 'PAID_ACTIVE';
		paymentStatus = isPaid ? 'PAID' : 'UNPAID';
	}

	// Update state based on payment status
	let effectiveState = gallery.state;
	if (!isPaid && gallery.state !== 'EXPIRED') {
		effectiveState = 'DRAFT';
	} else if (isPaid && gallery.state !== 'EXPIRED') {
		effectiveState = 'PAID_ACTIVE';
	}

	// Calculate days until expiry for UNPAID galleries (TTL-based)
	let daysUntilExpiry: number | null = null;
	let ttlExpiresAt: string | null = null;
	if (!isPaid && gallery.ttl) {
		const ttlSeconds = gallery.ttl;
		const ttlDate = new Date(ttlSeconds * 1000);
		const now = new Date();
		const diffMs = ttlDate.getTime() - now.getTime();
		daysUntilExpiry = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
		ttlExpiresAt = ttlDate.toISOString();
	}

	// Convert coverPhotoUrl from S3 to CloudFront if needed
	let coverPhotoUrl = gallery.coverPhotoUrl;
	const cloudfrontDomain = envProc?.env?.CLOUDFRONT_DOMAIN as string;
	if (coverPhotoUrl && cloudfrontDomain) {
		// Check if it's an S3 URL (contains .s3. or s3.amazonaws.com) and not already CloudFront
		const isS3Url = coverPhotoUrl.includes('.s3.') || coverPhotoUrl.includes('s3.amazonaws.com');
		const isCloudFrontUrl = coverPhotoUrl.includes(cloudfrontDomain);
		
		if (isS3Url && !isCloudFrontUrl) {
			// Extract S3 key from URL
			// Format: https://bucket.s3.region.amazonaws.com/key or https://bucket.s3.amazonaws.com/key
			const urlObj = new URL(coverPhotoUrl);
			const s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
			if (s3Key) {
				// Build CloudFront URL - encode path segments
				coverPhotoUrl = `https://${cloudfrontDomain}/${s3Key.split('/').map(encodeURIComponent).join('/')}`;
			}
		}
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			...gallery,
			coverPhotoUrl,
			state: effectiveState,
			paymentStatus,
			isPaid,
			daysUntilExpiry,
			ttlExpiresAt
		})
	};
});

