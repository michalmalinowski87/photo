import type { Gallery } from "../types";

import { getPublicGalleryUrl } from "./public-env";

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
    const cleaned = hostname.replace(/^www\./, "");
    // For subdomains like "gallery.photocloud.com", extract the base domain
    const parts = cleaned.split(".");
    if (parts.length >= 2) {
      // Return last two parts (e.g., "photocloud.com")
      return parts.slice(-2).join(".");
    }
    return cleaned;
  } catch {
    // If URL parsing fails, try to extract domain from string
    const match = galleryUrl.match(/https?:\/\/(?:www\.)?([^\/]+)/);
    if (match) {
      const hostname = match[1];
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        return parts.slice(-2).join(".");
      }
      return hostname;
    }
    // Fallback: assume it's already a base domain
    return galleryUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

/**
 * Build tenant-specific gallery URL.
 * If the gallery owner has a subdomain, returns: https://${subdomain}.${baseDomain}/${galleryId}
 * Otherwise, falls back to: ${galleryUrl}/${galleryId}
 * 
 * @param gallery - Gallery object (must have galleryId and optionally ownerSubdomain)
 * @param galleryUrl - Optional base gallery URL (defaults to NEXT_PUBLIC_GALLERY_URL)
 * @returns The tenant-specific gallery URL
 */
export function buildTenantGalleryUrl(
  gallery: Gallery | { galleryId: string; ownerSubdomain?: string | null },
  galleryUrl?: string
): string {
  const baseUrl = galleryUrl ?? getPublicGalleryUrl();
  const base = baseUrl.replace(/\/+$/, "");
  const galleryId = gallery.galleryId;

  const subdomain = gallery.ownerSubdomain;
  if (!subdomain) {
    // No subdomain, use fallback
    return `${base}/${encodeURIComponent(galleryId)}`;
  }

  // Build tenant URL
  const baseDomain = extractBaseDomain(baseUrl);
  return `https://${subdomain}.${baseDomain}/${encodeURIComponent(galleryId)}`;
}

/**
 * Build tenant-specific gallery login URL (for client access).
 * Similar to buildTenantGalleryUrl but constructs the login URL format: /login/${galleryId}
 * 
 * @param gallery - Gallery object (must have galleryId and optionally ownerSubdomain)
 * @param galleryUrl - Optional base gallery URL (defaults to NEXT_PUBLIC_GALLERY_URL)
 * @returns The tenant-specific gallery login URL
 */
export function buildTenantGalleryLoginUrl(
  gallery: Gallery | { galleryId: string; ownerSubdomain?: string | null },
  galleryUrl?: string
): string {
  const baseUrl = galleryUrl ?? getPublicGalleryUrl();
  const base = baseUrl.replace(/\/+$/, "");
  const galleryId = gallery.galleryId;

  const subdomain = gallery.ownerSubdomain;
  if (!subdomain) {
    // No subdomain, use fallback
    return `${base}/login/${encodeURIComponent(galleryId)}`;
  }

  // Build tenant URL
  const baseDomain = extractBaseDomain(baseUrl);
  return `https://${subdomain}.${baseDomain}/login/${encodeURIComponent(galleryId)}`;
}
