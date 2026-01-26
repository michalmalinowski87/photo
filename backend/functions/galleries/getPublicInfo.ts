import { lambdaLogger } from '../../../packages/logger/src';
import { ddbGet } from '../../lib/src/ddb';
import { getConfigValueFromSsm } from '../../lib/src/ssm-config';
import { getOwnerSubdomain, extractSubdomainFromEvent, extractBaseDomain } from '../../lib/src/gallery-url';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';

/**
 * Public (no-auth) endpoint for gallery login page.
 * Returns ONLY non-sensitive fields needed to render the login layout.
 */
export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
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
	// Start both async operations in parallel for better performance
	const ownerSubdomainPromise = getOwnerSubdomain(gallery.ownerId, usersTable, { logger });
	
	// Pre-check if we need subdomain validation by checking headers
	// This avoids SSM call if not needed (saves ~200-500ms)
	const headers = event?.headers || {};
	const origin = headers.Origin || headers.origin;
	const xForwardedHost = headers['X-Forwarded-Host'] || headers['x-forwarded-host'];
	const host = headers.Host || headers.host || '';
	const hostname = host.split(':')[0];
	// Check if Host is API Gateway (if so, we need Origin/X-Forwarded-Host to have subdomain)
	const isApiGatewayHost = hostname.includes('.execute-api.') || 
	                         hostname.includes('.amazonaws.com') ||
	                         hostname.includes('lambda-url.');
	// Only need validation if we have a potential subdomain source
	const needsSubdomainValidation = !!(origin || xForwardedHost || (!isApiGatewayHost && host));
	
	// Start SSM config fetch in parallel with owner subdomain fetch (only if needed)
	const configPromise = needsSubdomainValidation 
		? getRequiredConfigValue(stage, 'PublicGalleryUrl', { envVarName: 'PUBLIC_GALLERY_URL' })
		: Promise.resolve(null);
	
	// Wait for owner subdomain (needed for response)
	const ownerSubdomain = await ownerSubdomainPromise;
	
	// Security: Validate that if request is via subdomain, it matches gallery owner's subdomain
	// This prevents accessing galleries via someone else's subdomain (e.g., michalm.lvh.me/gal_userB_galleryId)
	if (needsSubdomainValidation) {
		try {
			// Get base domain from config to extract subdomain from request
			const galleryUrl = await configPromise;
			if (!galleryUrl) {
				throw new Error('PublicGalleryUrl config not available');
			}
			const baseDomain = extractBaseDomain(galleryUrl);
			
			logger?.info('Subdomain validation (getPublicInfo): starting', {
				galleryId: id,
				ownerId: gallery.ownerId,
				galleryUrl,
				baseDomain,
				hostHeader: event?.headers?.Host || event?.headers?.host || 'not found',
				allHeaders: Object.keys(event?.headers || {})
			});
			
			// Extract subdomain from request (if any)
			// Pass logger via event so extractSubdomainFromEvent can use it
			const eventWithLogger = { ...event, logger };
			const requestSubdomain = extractSubdomainFromEvent(eventWithLogger, baseDomain);
			
			logger?.info('Subdomain validation (getPublicInfo): extracted request subdomain', {
				galleryId: id,
				requestSubdomain,
				baseDomain,
				hasRequestSubdomain: !!requestSubdomain
			});
			
			// If request is via subdomain, validate it matches gallery owner
			if (requestSubdomain) {
				logger?.info('Subdomain validation (getPublicInfo): comparing subdomains', {
					galleryId: id,
					ownerId: gallery.ownerId,
					requestSubdomain,
					ownerSubdomain,
					requestSubdomainType: typeof requestSubdomain,
					ownerSubdomainType: typeof ownerSubdomain,
					requestSubdomainLength: requestSubdomain?.length,
					ownerSubdomainLength: ownerSubdomain?.length,
					areEqual: ownerSubdomain === requestSubdomain,
					requestSubdomainCharCodes: requestSubdomain?.split('').map((c: string) => c.charCodeAt(0)),
					ownerSubdomainCharCodes: ownerSubdomain?.split('').map((c: string) => c.charCodeAt(0))
				});
				
				if (!ownerSubdomain || ownerSubdomain !== requestSubdomain) {
					// Request is via subdomain but doesn't match gallery owner - security violation
					logger?.warn('Subdomain mismatch on getPublicInfo', {
						galleryId: id,
						requestSubdomain,
						ownerSubdomain,
						ownerId: gallery.ownerId,
						requestSubdomainType: typeof requestSubdomain,
						ownerSubdomainType: typeof ownerSubdomain,
						requestSubdomainLength: requestSubdomain?.length,
						ownerSubdomainLength: ownerSubdomain?.length,
						comparisonDetails: {
							requestSubdomainJSON: JSON.stringify(requestSubdomain),
							ownerSubdomainJSON: JSON.stringify(ownerSubdomain),
							strictEqual: ownerSubdomain === requestSubdomain,
							requestTrimmed: requestSubdomain?.trim(),
							ownerTrimmed: ownerSubdomain?.trim()
						}
					});
					return {
						statusCode: 403,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ 
							error: 'forbidden',
							message: 'Gallery does not belong to this subdomain'
						}),
					};
				}
				
				logger?.info('Subdomain validation (getPublicInfo): passed', {
					galleryId: id,
					requestSubdomain,
					ownerSubdomain
				});
			} else {
				logger?.info('Subdomain validation (getPublicInfo): no request subdomain, skipping validation', {
					galleryId: id
				});
			}
		} catch (error) {
			// If we can't validate (e.g., config missing), log but don't block
			// This allows the endpoint to work even if subdomain validation fails
			logger?.warn('Failed to validate subdomain ownership', { 
				error, 
				galleryId: id,
				errorName: (error as any)?.name,
				errorMessage: (error as any)?.message,
				errorStack: (error as any)?.stack
			});
		}
	}

	// Convert coverPhotoUrl from S3 to CloudFront if needed
	// Only fetch CloudFront domain if we actually have a coverPhotoUrl to process
	let coverPhotoUrl = gallery.coverPhotoUrl || null;
	if (coverPhotoUrl) {
		// Only fetch CloudFront domain if coverPhotoUrl exists and might need conversion
		const needsCloudFrontCheck = coverPhotoUrl.includes('.s3.') || coverPhotoUrl.includes('s3.amazonaws.com');
		if (needsCloudFrontCheck) {
			const cloudfrontDomain = (await getConfigValueFromSsm(stage, 'CloudFrontDomain')) || undefined;
			if (cloudfrontDomain && !coverPhotoUrl.includes(cloudfrontDomain)) {
				const urlObj = new URL(coverPhotoUrl);
				const s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
				if (s3Key) {
					coverPhotoUrl = `https://${cloudfrontDomain}/${s3Key.split('/').map(encodeURIComponent).join('/')}`;
				}
			}
		}
	}

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			galleryName: gallery.galleryName || null,
			coverPhotoUrl,
			loginPageLayout: gallery.loginPageLayout || null,
			coverPhotoPosition: gallery.coverPhotoPosition || null,
			ownerSubdomain: ownerSubdomain || null,
		}),
	};
});

