import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Extract base domain from a full gallery URL.
 * Examples:
 * - "https://gallery.photocloud.com" -> "photocloud.com"
 * - "https://gallery.lvh.me" -> "lvh.me"
 * - "https://photocloud.com/gallery" -> "photocloud.com"
 */
export function extractBaseDomain(galleryUrl: string): string {
	try {
		const url = new URL(galleryUrl);
		const hostname = url.hostname;
		// Remove "www." prefix if present
		const cleaned = hostname.replace(/^www\./, '');
		// For subdomains like "gallery.photocloud.com", extract the base domain
		const parts = cleaned.split('.');
		if (parts.length >= 2) {
			// Return last two parts (e.g., "photocloud.com")
			return parts.slice(-2).join('.');
		}
		return cleaned;
	} catch {
		// If URL parsing fails, try to extract domain from string
		const match = galleryUrl.match(/https?:\/\/(?:www\.)?([^\/]+)/);
		if (match) {
			const hostname = match[1];
			const parts = hostname.split('.');
			if (parts.length >= 2) {
				return parts.slice(-2).join('.');
			}
			return hostname;
		}
		// Fallback: assume it's already a base domain
		return galleryUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
	}
}

/**
 * Build canonical tenant gallery URL.
 * If the owner has a subdomain, returns: https://${subdomain}.${baseDomain}/${galleryId}
 * Otherwise, falls back to: ${galleryUrl}/${galleryId}
 */
export async function buildTenantGalleryUrl(
	ownerId: string,
	galleryId: string,
	galleryUrl: string,
	usersTable?: string
): Promise<string> {
	if (!usersTable) {
		// No users table configured, use fallback
		const base = galleryUrl.replace(/\/+$/, '');
		return `${base}/${galleryId}`;
	}

	try {
		// Get owner's subdomain
		const userResult = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId: ownerId },
			ProjectionExpression: 'subdomain'
		}));

		const subdomain = userResult.Item?.subdomain as string | undefined;
		if (!subdomain) {
			// No subdomain, use fallback
			const base = galleryUrl.replace(/\/+$/, '');
			return `${base}/${galleryId}`;
		}

		// Build tenant URL
		const baseDomain = extractBaseDomain(galleryUrl);
		return `https://${subdomain}.${baseDomain}/${galleryId}`;
	} catch (error: any) {
		// On error, fall back to standard URL
		const base = galleryUrl.replace(/\/+$/, '');
		return `${base}/${galleryId}`;
	}
}

/**
 * Get owner's subdomain (for public info endpoint).
 * Returns null if not found or on error.
 */
export async function getOwnerSubdomain(
	ownerId: string,
	usersTable?: string,
	event?: any
): Promise<string | null> {
	const logger = event?.logger;
	
	if (logger) {
		logger.debug('getOwnerSubdomain: starting', { ownerId, usersTable, hasUsersTable: !!usersTable });
	}
	
	if (!usersTable) {
		if (logger) {
			logger.debug('getOwnerSubdomain: no usersTable provided');
		}
		return null;
	}

	try {
		const userResult = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId: ownerId },
			ProjectionExpression: 'subdomain'
		}));

		const subdomain = (userResult.Item?.subdomain as string | undefined) || null;
		
		if (logger) {
			logger.debug('getOwnerSubdomain: retrieved from database', {
				ownerId,
				subdomain,
				hasItem: !!userResult.Item,
				itemKeys: userResult.Item ? Object.keys(userResult.Item) : [],
				subdomainType: typeof subdomain,
				subdomainLength: subdomain?.length,
				subdomainCharCodes: subdomain?.split('').map((c: string) => c.charCodeAt(0))
			});
		}

		return subdomain;
	} catch (error) {
		if (logger) {
			logger.warn('getOwnerSubdomain: error retrieving subdomain', {
				ownerId,
				errorName: (error as any)?.name,
				errorMessage: (error as any)?.message
			});
		}
		return null;
	}
}

/**
 * Reserved subdomains that should be treated as default domains (no subdomain).
 * "gallery" is the default gallery domain for clients without custom subdomains.
 */
const RESERVED_GALLERY_SUBDOMAINS = new Set([
	'gallery',
	'dashboard',
	'photocloud',
	'api',
	'auth',
	'www',
	'landing',
	'static',
	'cdn'
]);

/**
 * Extract subdomain from API Gateway event headers.
 * Looks for subdomain in Host header (e.g., "michalm.lvh.me" -> "michalm").
 * Returns null if no subdomain is found or if accessing via default gallery domain.
 * 
 * @param event - API Gateway Lambda event
 * @param baseDomain - Base domain to extract subdomain from (e.g., "lvh.me", "photocloud.com")
 * @returns The subdomain or null if not found/using default domain
 */
export function extractSubdomainFromEvent(event: any, baseDomain?: string): string | null {
	const headers = event?.headers || {};
	
	// Log for debugging
	const logger = (event as any)?.logger;
	if (logger) {
		logger.debug('extractSubdomainFromEvent: starting', { 
			host: headers.Host || headers.host,
			xForwardedHost: headers['X-Forwarded-Host'] || headers['x-forwarded-host'],
			origin: headers.Origin || headers.origin,
			baseDomain,
			headersKeys: Object.keys(headers)
		});
	}
	
	// Helper function to extract subdomain from a hostname
	const extractFromHostname = (hostname: string): string | null => {
		if (!hostname || !baseDomain) {
			return null;
		}
		
		// Remove port if present (e.g., "michalm.lvh.me:3000" -> "michalm.lvh.me")
		const cleanHostname = hostname.split(':')[0];
		
		// Check for subdomain.baseDomain pattern (case-insensitive match)
		const subdomainPattern = new RegExp(`^([^.]+)\\.${baseDomain.replace(/\./g, '\\.')}$`, 'i');
		const match = cleanHostname.match(subdomainPattern);
		if (match && match[1]) {
			const extracted = match[1].toLowerCase();
			
			// If extracted subdomain is reserved (e.g., "gallery"), treat as default domain (no subdomain)
			if (RESERVED_GALLERY_SUBDOMAINS.has(extracted)) {
				if (logger) {
					logger.debug('extractSubdomainFromEvent: extracted subdomain is reserved, treating as default domain', { 
						extracted, 
						hostname: cleanHostname
					});
				}
				return null;
			}
			
			if (logger) {
				logger.debug('extractSubdomainFromEvent: extracted via pattern match', { 
					extracted, 
					original: match[1],
					hostname: cleanHostname,
					pattern: subdomainPattern.toString()
				});
			}
			return extracted;
		}
		
		// If hostname exactly matches baseDomain (case-insensitive), no subdomain
		if (cleanHostname.toLowerCase() === baseDomain.toLowerCase()) {
			if (logger) {
				logger.debug('extractSubdomainFromEvent: hostname matches baseDomain exactly, no subdomain', { hostname: cleanHostname });
			}
			return null;
		}
		
		return null;
	};
	
	// Check if a hostname is an API Gateway hostname (should be ignored)
	const isApiGatewayHostname = (hostname: string): boolean => {
		return hostname.includes('.execute-api.') || 
		       hostname.includes('.amazonaws.com') ||
		       hostname.includes('lambda-url.');
	};
	
	// Priority 1: Check X-Forwarded-Host header (standard for proxied requests)
	const xForwardedHost = headers['X-Forwarded-Host'] || headers['x-forwarded-host'];
	if (xForwardedHost) {
		if (logger) {
			logger.debug('extractSubdomainFromEvent: checking X-Forwarded-Host', { xForwardedHost });
		}
		const extracted = extractFromHostname(xForwardedHost);
		if (extracted) {
			return extracted;
		}
	}
	
	// Priority 2: Check Origin header (contains the original origin)
	const origin = headers.Origin || headers.origin;
	if (origin) {
		try {
			const originUrl = new URL(origin);
			const originHostname = originUrl.hostname;
			if (logger) {
				logger.debug('extractSubdomainFromEvent: checking Origin header', { origin, originHostname });
			}
			const extracted = extractFromHostname(originHostname);
			if (extracted) {
				return extracted;
			}
		} catch (e) {
			if (logger) {
				logger.debug('extractSubdomainFromEvent: failed to parse Origin header', { origin, error: (e as any)?.message });
			}
		}
	}
	
	// Priority 3: Check Host header, but only if it's not an API Gateway hostname
	const host = headers.Host || headers.host || '';
	if (host) {
		const hostname = host.split(':')[0];
		
		// Skip API Gateway hostnames - they don't contain the original subdomain
		if (isApiGatewayHostname(hostname)) {
			if (logger) {
				logger.debug('extractSubdomainFromEvent: Host header is API Gateway hostname, skipping', { hostname });
			}
		} else {
			if (logger) {
				logger.debug('extractSubdomainFromEvent: checking Host header', { hostname });
			}
			const extracted = extractFromHostname(hostname);
			if (extracted) {
				return extracted;
			}
		}
	}
	
	if (logger) {
		logger.debug('extractSubdomainFromEvent: no subdomain found in any header', { 
			host, 
			xForwardedHost, 
			origin,
			baseDomain 
		});
	}
	
	return null;
}
