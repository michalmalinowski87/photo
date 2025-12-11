/**
 * Image fallback utility for robust image loading
 *
 * ⚠️ IMPORTANT: This is the SINGLE SOURCE OF TRUTH for image loading strategy.
 * This includes:
 * - URL selection (thumb/preview/bigthumb priority)
 * - Progressive fallback (CloudFront → S3 → next size → original)
 * - Cache busting (using S3 lastModified timestamp)
 *
 * If you need to update the strategy, you MUST also update:
 * - packages/gallery-components/src/imageFallback.js (JavaScript version)
 *
 * Handles progressive fallback strategy:
 * 1. CloudFront URL (primary)
 * 2. S3 presigned URL fallback (if CloudFront fails with 403)
 * 3. Next size version (thumb → preview → bigthumb)
 * 4. Original photo from S3 (ultimate fallback)
 *
 * Cache busting strategy:
 * - For CloudFront URLs: Uses `v={lastModified}` as version parameter
 *   - Same file (same lastModified) = same URL = browser caches it
 *   - Different file (different lastModified) = different URL = fresh fetch
 *   - Solves file replacement: when photo is replaced with same name, lastModified changes = new URL
 *   - CloudFront cache policy includes query strings in cache key, so versions are cached separately
 * - For S3 presigned URLs: Uses `t={lastModified}` (legacy format)
 * - When a new photo is uploaded, S3 lastModified changes automatically, creating new versioned URL
 */

export interface ImageFallbackUrls {
  thumbUrl?: string | null;
  thumbUrlFallback?: string | null;
  previewUrl?: string | null;
  previewUrlFallback?: string | null;
  bigThumbUrl?: string | null;
  bigThumbUrlFallback?: string | null;
  url?: string | null; // Original photo S3 presigned URL
  finalUrl?: string | null;
  lastModified?: string | number; // S3 LastModified timestamp for cache busting
}

export type ImageSize = "thumb" | "preview" | "bigthumb";

/**
 * Check if a URL is a CloudFront URL (vs S3 presigned URL)
 * CloudFront URLs typically have a specific domain pattern
 */
function isCloudFrontUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // CloudFront URLs typically use cloudfront.net domain or a custom CloudFront domain
    // S3 presigned URLs use s3.amazonaws.com or the bucket's regional endpoint
    const hostname = urlObj.hostname.toLowerCase();
    return (
      hostname.includes("cloudfront.net") ||
      hostname.includes("cloudfront") ||
      // Check if it's NOT an S3 URL (presigned URLs have specific patterns)
      (!hostname.includes("s3") && !hostname.includes("amazonaws.com"))
    );
  } catch {
    return false;
  }
}

/**
 * Add version query parameter to URL using S3 lastModified timestamp
 * This is part of the unified image loading strategy
 *
 * STRATEGY:
 * - For CloudFront URLs: Use `v={lastModified}` as a version parameter
 *   - Same file (same lastModified) = same URL = browser caches it
 *   - Different file (different lastModified) = different URL = fresh fetch
 *   - CloudFront cache policy includes query strings in cache key, so different versions are cached separately
 *   - This solves the file replacement problem: when a photo is replaced with the same name,
 *     the lastModified changes, creating a new URL that bypasses the old cache
 *
 * - For S3 presigned URLs: Use `t={lastModified}` (legacy format for compatibility)
 *   - S3 presigned URLs already have query parameters and expire, so this is for consistency
 *
 * Uses only S3 lastModified timestamp - when a new photo is uploaded,
 * S3's lastModified changes automatically, creating a new versioned URL
 */
function addCacheBustingToUrl(
  url: string | null | undefined,
  lastModified?: string | number
): string | null {
  if (!url) {
    return null;
  }

  // Calculate lastModified timestamp
  const lastModifiedTs = lastModified
    ? typeof lastModified === "string"
      ? new Date(lastModified).getTime()
      : lastModified
    : Date.now();

  // For CloudFront URLs, use version parameter (v={lastModified})
  // This allows browser caching while handling file replacements
  // CloudFront cache policy includes query strings in cache key, so different versions are cached separately
  if (isCloudFrontUrl(url)) {
    try {
      const urlObj = new URL(url);
      // Remove any old cache-busting parameters
      urlObj.searchParams.delete("t");
      urlObj.searchParams.delete("f");
      // Set version parameter based on lastModified
      // Same file = same version = same URL = cached
      // Different file = different version = different URL = fresh fetch
      urlObj.searchParams.set("v", String(lastModifiedTs));
      return urlObj.toString();
    } catch {
      // If URL parsing fails, append version parameter manually
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}v=${lastModifiedTs}`;
    }
  }

  // For S3 presigned URLs, use legacy format (t={lastModified}) for compatibility
  // Remove any existing cache-busting parameters to avoid duplicates
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.delete("t");
    urlObj.searchParams.delete("f");
    urlObj.searchParams.delete("v");
    url = urlObj.toString();
  } catch {
    // If URL parsing fails, continue with original URL
  }

  // If URL already has query parameters, append; otherwise add
  const separator = url.includes("?") ? "&" : "?";

  // Format: t={lastModified} for S3 URLs (legacy)
  return `${url}${separator}t=${lastModifiedTs}`;
}

/**
 * Get the initial image URL based on size preference
 * Priority: thumb → preview → bigthumb → original
 *
 * Automatically applies cache busting using S3 lastModified timestamp
 * This is part of the unified image loading strategy
 */
export function getInitialImageUrl(
  img: ImageFallbackUrls,
  preferredSize: ImageSize = "thumb"
): string {
  // Priority based on preferred size
  let url: string;
  if (preferredSize === "thumb") {
    url = img.thumbUrl ?? img.previewUrl ?? img.bigThumbUrl ?? img.finalUrl ?? img.url ?? "";
  } else if (preferredSize === "preview") {
    url = img.previewUrl ?? img.bigThumbUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? "";
  } else {
    url = img.bigThumbUrl ?? img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? "";
  }

  // Apply cache busting automatically (part of unified strategy)
  const cachedUrl = addCacheBustingToUrl(url, img.lastModified);

  return cachedUrl ?? url;
}

/**
 * Check if a URL is the final/original URL (not a size variant)
 */
export function isFinalUrl(url: string, img: ImageFallbackUrls): boolean {
  const normalized = normalizeUrl(url);
  // Check if URL matches finalUrl or url (original)
  if ((img.finalUrl && urlsMatch(url, img.finalUrl)) ?? (img.url && urlsMatch(url, img.url))) {
    return true;
  }
  // Check if URL path indicates it's the original (contains /final/ or /originals/ or doesn't contain size folders)
  return (
    normalized.includes("/final/") ||
    normalized.includes("/originals/") ||
    (!normalized.includes("/thumbs/") &&
      !normalized.includes("/previews/") &&
      !normalized.includes("/bigthumbs/"))
  );
}

/**
 * Normalize URL by removing query parameters for comparison
 * This handles cache-busting parameters that might be added
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    return url.split("?")[0]; // Fallback: just remove query string
  }
}

/**
 * Check if two URLs point to the same resource (ignoring query params)
 */
function urlsMatch(url1: string, url2: string | null | undefined): boolean {
  if (!url2) {
    return false;
  }
  return normalizeUrl(url1) === normalizeUrl(url2);
}

/**
 * Get the next fallback URL when current URL fails
 * Implements tiered fallback strategy: smallest to largest, CloudFront first, then S3
 *
 * Fallback strategies:
 * - thumb: CloudFront thumb → bigthumb → preview → S3 thumb → bigthumb → preview → original
 * - bigthumb: CloudFront bigthumb → preview → S3 bigthumb → preview → original
 * - preview: CloudFront preview → S3 preview → original
 *
 * Automatically applies cache busting to fallback URLs using S3 lastModified timestamp
 * This is part of the unified image loading strategy
 *
 * @param attemptedSizes - Set of sizes that have already been attempted (to prevent retrying)
 * @param preferredSize - The initial preferred size (thumb/bigthumb/preview) to determine fallback chain
 */
export function getNextFallbackUrl(
  currentUrl: string,
  img: ImageFallbackUrls,
  attemptedSizes?: Set<"thumb" | "preview" | "bigthumb">,
  preferredSize?: "thumb" | "preview" | "bigthumb"
): string | null {
  // Determine which URL failed and detect preferred size if not provided
  const failedUrl = currentUrl;

  // Detect preferred size from failed URL if not provided
  const detectPreferredSize = (): "thumb" | "preview" | "bigthumb" => {
    if (preferredSize) {
      return preferredSize;
    }
    const normalized = normalizeUrl(failedUrl);
    if (normalized.includes("/thumbs/")) {
      return "thumb";
    }
    if (normalized.includes("/bigthumbs/")) {
      return "bigthumb";
    }
    if (normalized.includes("/previews/")) {
      return "preview";
    }
    return "thumb"; // Default
  };

  const detectedPreferredSize = detectPreferredSize();

  // Helper to check if a size has been attempted
  const hasAttemptedSize = (size: "thumb" | "preview" | "bigthumb") => {
    return attemptedSizes?.has(size) ?? false;
  };

  // Helper to check if URL is CloudFront or S3
  const isCloudFront = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return isCloudFrontUrl(url);
  };

  // Helper to try a CloudFront URL
  const tryCloudFront = (
    size: "thumb" | "preview" | "bigthumb",
    url: string | null | undefined
  ): string | null => {
    if (hasAttemptedSize(size)) {
      return null;
    }
    if (!url || urlsMatch(failedUrl, url)) {
      return null;
    }
    // Only try if it's actually a CloudFront URL
    if (!isCloudFront(url)) {
      return null;
    }
    return addCacheBustingToUrl(url, img.lastModified);
  };

  // Helper to try an S3 fallback URL
  const tryS3 = (
    size: "thumb" | "preview" | "bigthumb",
    url: string | null | undefined
  ): string | null => {
    if (hasAttemptedSize(size)) {
      return null;
    }
    if (!url || urlsMatch(failedUrl, url)) {
      return null;
    }
    return addCacheBustingToUrl(url, img.lastModified);
  };

  // Check if the failed URL was CloudFront or S3
  const failedUrlWasCloudFront = isCloudFront(failedUrl);

  // Implement tiered fallback strategy: try all CloudFront versions first, then all S3 versions
  // Strategy: Try all CloudFront (thumb → bigthumb → preview), then all S3 (thumb → bigthumb → preview), then original
  if (detectedPreferredSize === "thumb") {
    // If CloudFront thumb failed, try S3 thumb for same size first
    if (failedUrlWasCloudFront) {
      const thumbS3 = tryS3("thumb", img.thumbUrlFallback);
      if (thumbS3) {
        return thumbS3;
      }
    }

    // Try all remaining CloudFront versions (from smallest to largest)
    const bigThumbCf = tryCloudFront("bigthumb", img.bigThumbUrl);
    if (bigThumbCf) {
      return bigThumbCf;
    }

    const previewCf = tryCloudFront("preview", img.previewUrl);
    if (previewCf) {
      return previewCf;
    }

    // All CloudFront options exhausted, try remaining S3 versions
    // (thumb already tried if failed URL was CloudFront)
    if (!failedUrlWasCloudFront) {
      const thumbS3 = tryS3("thumb", img.thumbUrlFallback);
      if (thumbS3) {
        return thumbS3;
      }
    }

    const bigThumbS3 = tryS3("bigthumb", img.bigThumbUrlFallback);
    if (bigThumbS3) {
      return bigThumbS3;
    }

    const previewS3 = tryS3("preview", img.previewUrlFallback);
    if (previewS3) {
      return previewS3;
    }
  } else if (detectedPreferredSize === "bigthumb") {
    // If CloudFront bigthumb failed, try S3 bigthumb for same size first
    if (failedUrlWasCloudFront) {
      const bigThumbS3 = tryS3("bigthumb", img.bigThumbUrlFallback);
      if (bigThumbS3) {
        return bigThumbS3;
      }
    }

    // Try remaining CloudFront versions
    const previewCf = tryCloudFront("preview", img.previewUrl);
    if (previewCf) {
      return previewCf;
    }

    // All CloudFront options exhausted, try remaining S3 versions
    if (!failedUrlWasCloudFront) {
      const bigThumbS3 = tryS3("bigthumb", img.bigThumbUrlFallback);
      if (bigThumbS3) {
        return bigThumbS3;
      }
    }

    const previewS3 = tryS3("preview", img.previewUrlFallback);
    if (previewS3) {
      return previewS3;
    }
  } else if (detectedPreferredSize === "preview") {
    // If CloudFront preview failed, try S3 preview for same size first
    if (failedUrlWasCloudFront) {
      const previewS3 = tryS3("preview", img.previewUrlFallback);
      if (previewS3) {
        return previewS3;
      }
    }

    // All CloudFront options exhausted, try S3 preview if not already tried
    if (!failedUrlWasCloudFront) {
      const previewS3 = tryS3("preview", img.previewUrlFallback);
      if (previewS3) {
        return previewS3;
      }
    }
  }

  // Final fallback: try original photo
  // Try CloudFront finalUrl first (if different from failed URL)
  if (img.finalUrl && !urlsMatch(failedUrl, img.finalUrl)) {
    return addCacheBustingToUrl(img.finalUrl, img.lastModified);
  }

  // Try S3 presigned original URL (if different from failed URL)
  if (img.url && !urlsMatch(failedUrl, img.url)) {
    return addCacheBustingToUrl(img.url, img.lastModified);
  }

  // No more fallbacks available
  return null;
}

/**
 * Create an error handler for img onError that implements progressive fallback
 */
export function createImageErrorHandler(
  img: ImageFallbackUrls,
  preferredSize: ImageSize = "thumb",
  onFallback?: (newUrl: string) => void
) {
  return (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const currentSrc = e.currentTarget.src;
    const nextUrl = getNextFallbackUrl(currentSrc, img, undefined, preferredSize);

    if (nextUrl) {
      e.currentTarget.src = nextUrl;
      if (onFallback) {
        onFallback(nextUrl);
      }
    }
    // If no fallback available, the image will show error state
  };
}
