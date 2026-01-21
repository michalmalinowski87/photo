import { lambdaLogger } from '../../../packages/logger/src';
import { ddbGet } from '../../lib/src/ddb';
import { getConfigValueFromSsm } from '../../lib/src/ssm-config';
import { getOwnerSubdomain, extractSubdomainFromEvent, extractBaseDomain } from '../../lib/src/gallery-url';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';

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
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const stage = envProc?.env?.STAGE || 'dev';

	const gallery = await ddbGet<any>(tableName, { galleryId: id });
	if (!gallery) {
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'not found' }),
		};
	}

	// Get owner's subdomain for canonical URL construction
	const ownerSubdomain = await getOwnerSubdomain(gallery.ownerId, usersTable);
	
	// Security: Validate that if request is via subdomain, it matches gallery owner's subdomain
	// This prevents accessing galleries via someone else's subdomain (e.g., michalm.lvh.me/gal_userB_galleryId)
	try {
		// Get base domain from config to extract subdomain from request
		const galleryUrl = await getRequiredConfigValue(stage, 'PublicGalleryUrl', { envVarName: 'PUBLIC_GALLERY_URL' });
		const baseDomain = extractBaseDomain(galleryUrl);
		
		// Extract subdomain from request (if any)
		const requestSubdomain = extractSubdomainFromEvent(event, baseDomain);
		
		// If request is via subdomain, validate it matches gallery owner
		if (requestSubdomain) {
			if (!ownerSubdomain || ownerSubdomain !== requestSubdomain) {
				// Request is via subdomain but doesn't match gallery owner - security violation
				return {
					statusCode: 403,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ 
						error: 'forbidden',
						message: 'Gallery does not belong to this subdomain'
					}),
				};
			}
		}
	} catch (error) {
		// If we can't validate (e.g., config missing), log but don't block
		// This allows the endpoint to work even if subdomain validation fails
		const logger = (event as any).logger;
		if (logger) {
			logger.warn('Failed to validate subdomain ownership', { error, galleryId: id });
		}
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
			ownerSubdomain: ownerSubdomain || null,
		}),
	};
});

