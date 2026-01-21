/**
 * Secure origin validation for wildcard subdomain support.
 * 
 * For fixed hosts (dashboard, landing, api): exact match required.
 * For tenant subdomains: dot-boundary check (prevents evil.dashboard.lvh.me).
 */

/**
 * Extract base domain from hostname.
 * Examples:
 * - "dashboard.lvh.me" -> "lvh.me"
 * - "photocloud.lvh.me" -> "lvh.me"
 * - "michalphotography.lvh.me" -> "lvh.me"
 * - "dashboard.photocloud.com" -> "photocloud.com"
 */
export function getBaseDomain(hostname: string): string {
	const parts = hostname.split('.');
	if (parts.length >= 2) {
		return parts.slice(-2).join('.');
	}
	return hostname;
}

/**
 * Check if a hostname is a tenant subdomain (not a fixed host).
 * Fixed hosts: dashboard, photocloud, api, auth, www, gallery, landing, static, cdn
 */
const FIXED_HOSTS = new Set([
	'dashboard',
	'photocloud',
	'api',
	'auth',
	'www',
	'gallery',
	'landing',
	'static',
	'cdn',
]);

export function isTenantSubdomain(hostname: string): boolean {
	const parts = hostname.split('.');
	if (parts.length < 2) {
		return false;
	}
	const subdomain = parts[0];
	return !FIXED_HOSTS.has(subdomain);
}

/**
 * Validate origin with dot-boundary check for tenant subdomains.
 * 
 * For fixed hosts: exact match required.
 * For tenant subdomains: must share the same base domain and be a valid tenant subdomain.
 * 
 * Examples:
 * - "https://dashboard.lvh.me" matches "https://dashboard.lvh.me" ✓
 * - "https://michalphotography.lvh.me" matches "https://*.lvh.me" (base domain match) ✓
 * - "https://evil.dashboard.lvh.me" does NOT match "https://dashboard.lvh.me" ✗ (dot-boundary violation)
 */
export function isValidOrigin(eventOrigin: string, trustedOrigin: string): boolean {
	try {
		const eventUrl = new URL(eventOrigin);
		const trustedUrl = new URL(trustedOrigin);

		// Exact match for fixed hosts
		if (eventUrl.origin === trustedUrl.origin) {
			return true;
		}

		// For tenant subdomains: check base domain match and dot-boundary
		const eventBase = getBaseDomain(eventUrl.hostname);
		const trustedBase = getBaseDomain(trustedUrl.hostname);

		if (eventBase !== trustedBase) {
			return false;
		}

		// Both must be tenant subdomains (not fixed hosts)
		// This prevents evil.dashboard.lvh.me from matching dashboard.lvh.me
		const eventIsTenant = isTenantSubdomain(eventUrl.hostname);
		const trustedIsTenant = isTenantSubdomain(trustedUrl.hostname);

		// If trusted is a fixed host, only exact match allowed
		if (!trustedIsTenant) {
			return false;
		}

		// If event is a fixed host but trusted is tenant, reject
		if (!eventIsTenant) {
			return false;
		}

		// Both are tenant subdomains on the same base domain: allow
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if an origin matches a list of trusted origins (fixed hosts only).
 * For tenant subdomains, use isValidOrigin with wildcard pattern.
 */
export function isTrustedFixedOrigin(eventOrigin: string, trustedOrigins: string[]): boolean {
	return trustedOrigins.some((trusted) => {
		try {
			const eventUrl = new URL(eventOrigin);
			const trustedUrl = new URL(trusted);
			return eventUrl.origin === trustedUrl.origin;
		} catch {
			return false;
		}
	});
}
