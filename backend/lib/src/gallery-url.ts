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
function extractBaseDomain(galleryUrl: string): string {
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
	usersTable?: string
): Promise<string | null> {
	if (!usersTable) {
		return null;
	}

	try {
		const userResult = await ddb.send(new GetCommand({
			TableName: usersTable,
			Key: { userId: ownerId },
			ProjectionExpression: 'subdomain'
		}));

		return (userResult.Item?.subdomain as string | undefined) || null;
	} catch {
		return null;
	}
}
