import { lambdaLogger } from '../../../packages/logger/src';
import { ddbGet } from '../../lib/src/ddb';
import { getConfigValueFromSsm } from '../../lib/src/ssm-config';

/**
 * Public (no-auth) endpoint for gallery login page.
 * Returns ONLY non-sensitive fields needed to render the login layout.
 */
export const handler = lambdaLogger(async (event: any) => {
	const id = event?.pathParameters?.id;
	if (!id) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'missing id' }),
		};
	}

	const envProc = (globalThis as any).process;
	const tableName = envProc && envProc.env ? (envProc.env.GALLERIES_TABLE as string) : '';
	const stage = envProc?.env?.STAGE || 'dev';

	const gallery = await ddbGet<any>(tableName, { galleryId: id });
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'not found' }),
		};
	}

	// Convert coverPhotoUrl from S3 to CloudFront if needed
	// Read CloudFront domain from SSM Parameter Store (avoids circular dependency in CDK)
	let coverPhotoUrl = gallery.coverPhotoUrl || null;
	const cloudfrontDomain = (await getConfigValueFromSsm(stage, 'CloudFrontDomain')) || undefined;
	if (coverPhotoUrl && cloudfrontDomain) {
		// Check if it's an S3 URL (contains .s3. or s3.amazonaws.com) and not already CloudFront
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
			galleryName: gallery.galleryName || null,
			coverPhotoUrl,
		}),
	};
});

