import { lambdaLogger } from '../../../packages/logger/src';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { signJWT } from '../../lib/src/jwt';
import { getPaidTransactionForGallery } from '../../lib/src/transactions';
import { verifyClientGalleryPassword } from '../../lib/src/client-gallery-password';
import { getOwnerSubdomain, extractSubdomainFromEvent, extractBaseDomain } from '../../lib/src/gallery-url';
import { getRequiredConfigValue } from '../../lib/src/ssm-config';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = lambdaLogger(async (event: any, context: any) => {
	const logger = (context as any).logger;
	const envProc = (globalThis as any).process;
	const galleriesTable = envProc?.env?.GALLERIES_TABLE as string;
	const usersTable = envProc?.env?.USERS_TABLE as string;
	const stage = envProc?.env?.STAGE || 'dev';
	
	if (!galleriesTable) {
		return {
			statusCode: 500,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Missing configuration' })
		};
	}

	const galleryId = event?.pathParameters?.id;
	if (!galleryId) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery ID required' })
		};
	}

	const body = event?.body ? JSON.parse(event.body) : {};
	const passwordRaw = body?.password;

	if (!passwordRaw || typeof passwordRaw !== 'string') {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Password required' })
		};
	}

	// Trim password to ensure consistency with create.ts and setClientPassword.ts
	const password = passwordRaw.trim();
	if (!password) {
		return {
			statusCode: 400,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Password cannot be empty' })
		};
	}

	// Fetch gallery
	const galleryGet = await ddb.send(new GetCommand({
		TableName: galleriesTable,
		Key: { galleryId }
	}));

	const gallery = galleryGet.Item as any;
	if (!gallery) {
		logger.warn('Gallery not found', { galleryId });
		return {
			statusCode: 404,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Gallery not found' })
		};
	}

	// Security: Validate that if request is via subdomain, it matches gallery owner's subdomain
	// This prevents accessing galleries via someone else's subdomain (e.g., michalm.lvh.me/gal_userB_galleryId)
	try {
		// Get base domain from config to extract subdomain from request
		const galleryUrl = await getRequiredConfigValue(stage, 'PublicGalleryUrl', { envVarName: 'PUBLIC_GALLERY_URL' });
		const baseDomain = extractBaseDomain(galleryUrl);
		
		logger.info('Subdomain validation: starting', {
			galleryId,
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
		
		logger.info('Subdomain validation: extracted request subdomain', {
			galleryId,
			requestSubdomain,
			baseDomain,
			hasRequestSubdomain: !!requestSubdomain
		});
		
		// If request is via subdomain, validate it matches gallery owner
		if (requestSubdomain) {
			const ownerSubdomain = await getOwnerSubdomain(gallery.ownerId, usersTable, { logger });
			
			logger.info('Subdomain validation: comparing subdomains', {
				galleryId,
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
				logger.warn('Subdomain mismatch on client login', { 
					galleryId, 
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
			
			logger.info('Subdomain validation: passed', {
				galleryId,
				requestSubdomain,
				ownerSubdomain
			});
		} else {
			logger.info('Subdomain validation: no request subdomain, skipping validation', {
				galleryId
			});
		}
	} catch (error) {
		// If we can't validate (e.g., config missing), log but don't block
		// This allows the endpoint to work even if subdomain validation fails
		logger.warn('Failed to validate subdomain ownership on client login', { 
			error, 
			galleryId,
			errorName: (error as any)?.name,
			errorMessage: (error as any)?.message,
			errorStack: (error as any)?.stack
		});
	}

	// Check if gallery is published before allowing client login
	// This prevents access even if someone has the correct password
	let isPaid = false;
	try {
		const paidTransaction = await getPaidTransactionForGallery(galleryId);
		isPaid = !!paidTransaction;
	} catch (err) {
		// If transaction check fails, fall back to gallery state
		isPaid = gallery.state === 'PAID_ACTIVE';
	}

	if (!isPaid) {
		logger.warn('Client login attempt for unpublished gallery', { galleryId, galleryState: gallery.state });
		return {
			statusCode: 403,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ 
				error: 'Gallery not published',
				message: 'This gallery is not yet published. Please contact the photographer.'
			})
		};
	}

	// Check if password fields exist
	if (!gallery.clientPasswordHash || !gallery.clientPasswordSalt || !gallery.clientPasswordIter) {
		logger.warn('Password not set for gallery', { 
			galleryId,
			hasHash: !!gallery.clientPasswordHash,
			hasSalt: !!gallery.clientPasswordSalt,
			hasIter: !!gallery.clientPasswordIter
		});
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Password not set for this gallery' })
		};
	}

	// Verify password
	const passwordValid = verifyClientGalleryPassword(password, {
		hashHex: gallery.clientPasswordHash,
		saltHex: gallery.clientPasswordSalt,
		iterations: gallery.clientPasswordIter,
	});

	if (!passwordValid) {
		logger.warn('Invalid password attempt', { 
			galleryId,
			hasHash: !!gallery.clientPasswordHash,
			hasSalt: !!gallery.clientPasswordSalt,
			hasIter: !!gallery.clientPasswordIter,
			iterValue: gallery.clientPasswordIter
		});
		return {
			statusCode: 401,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ error: 'Invalid password' })
		};
	}

	// Get clientId from gallery (clientEmail is used as clientId)
	const clientId = gallery.clientEmail || galleryId;

	// Generate JWT token (valid for 7 days)
	const token = await signJWT({
		galleryId,
		clientId
	}, 7 * 24 * 3600);

	logger.info('Client login successful', { galleryId, clientId });

	return {
		statusCode: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			token,
			galleryId,
			clientId,
			galleryName: gallery.galleryName || null
		})
	};
});

