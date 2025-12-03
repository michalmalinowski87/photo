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
 * - Uses S3 lastModified timestamp to avoid unnecessary cache busting
 * - Same file = same timestamp = can be cached
 * - Different file = different timestamp = fresh fetch
 * - When a new photo is uploaded, S3 lastModified changes automatically
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
 * Add cache-busting query parameter to URL using S3 lastModified timestamp
 * This is part of the unified image loading strategy
 *
 * Uses only S3 lastModified timestamp - when a new photo is uploaded,
 * S3's lastModified changes automatically, so no extra cache busting is needed
 */
function addCacheBustingToUrl(
  url: string | null | undefined,
  lastModified?: string | number
): string | null {
  if (!url) {
    return null;
  }

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

  // Use lastModified timestamp if available (from S3 LastModified)
  // This ensures we don't cache-bust unnecessarily - same file = same timestamp
  // When a new photo is uploaded, S3 lastModified changes automatically
  const lastModifiedTs = lastModified
    ? typeof lastModified === "string"
      ? new Date(lastModified).getTime()
      : lastModified
    : Date.now();

  // Format: t={lastModified}
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
    // Skip if URL doesn't actually exist (check if it's null/undefined or points to non-existent resource)
    // This prevents trying to fallback to sizes that were never generated
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

  // Implement tiered fallback strategy based on preferred size
  if (detectedPreferredSize === "thumb") {
    // Thumb strategy: CloudFront thumb → bigthumb → preview → S3 thumb → bigthumb → preview → original
    // If CloudFront thumb failed, try CloudFront bigthumb
    const bigThumbCf = tryCloudFront("bigthumb", img.bigThumbUrl);
    if (bigThumbCf) {
      return bigThumbCf;
    }

    // If CloudFront bigthumb failed or not available, try CloudFront preview
    const previewCf = tryCloudFront("preview", img.previewUrl);
    if (previewCf) {
      return previewCf;
    }

    // All CloudFront options exhausted, try S3 thumb
    const thumbS3 = tryS3("thumb", img.thumbUrlFallback);
    if (thumbS3) {
      return thumbS3;
    }

    // If S3 thumb failed or not available, try S3 bigthumb
    const bigThumbS3 = tryS3("bigthumb", img.bigThumbUrlFallback);
    if (bigThumbS3) {
      return bigThumbS3;
    }

    // If S3 bigthumb failed or not available, try S3 preview
    const previewS3 = tryS3("preview", img.previewUrlFallback);
    if (previewS3) {
      return previewS3;
    }
  } else if (detectedPreferredSize === "bigthumb") {
    // Bigthumb strategy: CloudFront bigthumb → preview → S3 bigthumb → preview → original
    // If CloudFront bigthumb failed, try CloudFront preview
    const previewCf = tryCloudFront("preview", img.previewUrl);
    if (previewCf) {
      return previewCf;
    }

    // All CloudFront options exhausted, try S3 bigthumb
    const bigThumbS3 = tryS3("bigthumb", img.bigThumbUrlFallback);
    if (bigThumbS3) {
      return bigThumbS3;
    }

    // If S3 bigthumb failed or not available, try S3 preview
    const previewS3 = tryS3("preview", img.previewUrlFallback);
    if (previewS3) {
      return previewS3;
    }
  } else if (detectedPreferredSize === "preview") {
    // Preview strategy: CloudFront preview → S3 preview → original
    // If CloudFront preview failed, try S3 preview
    const previewS3 = tryS3("preview", img.previewUrlFallback);
    if (previewS3) {
      return previewS3;
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
  console.warn("[ImageFallback] ❌ No more fallbacks available", {
    failedUrl: normalizeUrl(failedUrl),
    preferredSize: detectedPreferredSize,
    attemptedSizes: attemptedSizes ? Array.from(attemptedSizes) : [],
    availableUrls: {
      hasThumbUrl: !!img.thumbUrl,
      hasThumbUrlFallback: !!img.thumbUrlFallback,
      hasPreviewUrl: !!img.previewUrl,
      hasPreviewUrlFallback: !!img.previewUrlFallback,
      hasBigThumbUrl: !!img.bigThumbUrl,
      hasBigThumbUrlFallback: !!img.bigThumbUrlFallback,
      hasUrl: !!img.url,
      hasFinalUrl: !!img.finalUrl,
    },
  });
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
