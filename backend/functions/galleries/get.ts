import { lambdaLogger } from '../../../packages/logger/src';
import { ddbGet } from '../../lib/src/ddb';
import { getUserIdFromEvent, requireOwnerOr403 } from '../../lib/src/auth';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';
import { getConfigValueFromSsm } from '../../lib/src/ssm-config';
import { getOwnerSubdomain } from '../../lib/src/gallery-url';

export const handler = lambdaLogger(async (event: any) => {
	const id = event?.pathParameters?.id;
	if (!id) return { statusCode: 400, body: 'missing id' };
	const envProc = (globalThis as any).process;
	const tableName = envProc && envProc.env ? (envProc.env.GALLERIES_TABLE as string) : '';
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const stage = envProc?.env?.STAGE || 'dev';
	const gallery = await ddbGet<any>(tableName, { galleryId: id });
	if (!gallery) {
		return { statusCode: 404, body: JSON.stringify({ error: 'not found' }) };
	}
	const requesterId = getUserIdFromEvent(event);
	requireOwnerOr403(gallery.ownerId, requesterId);
	
	// Get owner's subdomain for tenant URL construction
	const ownerSubdomain = await getOwnerSubdomain(gallery.ownerId, usersTable);
	
	let isPaid = false;
	let paymentStatus = 'UNPAID';
	try {
		const paidTransaction = await getPaidTransactionForGallery(id);
		isPaid = !!paidTransaction;
		paymentStatus = isPaid ? 'PAID' : 'UNPAID';
	} catch (err) {
		isPaid = gallery.state === 'PAID_ACTIVE';
		paymentStatus = isPaid ? 'PAID' : 'UNPAID';
	}

	let effectiveState = gallery.state;
	if (!isPaid && gallery.state !== 'EXPIRED') {
		effectiveState = 'DRAFT';
	} else if (isPaid && gallery.state !== 'EXPIRED') {
		effectiveState = 'PAID_ACTIVE';
	}

	let daysUntilExpiry: number | null = null;
	if (gallery.expiresAt) {
		const expiresAtDate = new Date(gallery.expiresAt);
		const now = new Date();
		const diffMs = expiresAtDate.getTime() - now.getTime();
		daysUntilExpiry = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
	}

	let coverPhotoUrl = gallery.coverPhotoUrl;
	// Read CloudFront domain from SSM Parameter Store (avoids circular dependency in CDK)
	const cloudfrontDomain = await getConfigValueFromSsm(stage, 'CloudFrontDomain') || undefined;
	if (coverPhotoUrl && cloudfrontDomain) {
		const isS3Url = coverPhotoUrl.includes('.s3.') || coverPhotoUrl.includes('s3.amazonaws.com');
		const isCloudFrontUrl = coverPhotoUrl.includes(cloudfrontDomain);
		
		if (isS3Url && !isCloudFrontUrl) {
			const urlObj = new URL(coverPhotoUrl);
			const s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
			if (s3Key) {
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
			ownerSubdomain: ownerSubdomain || null
		})
	};
});

