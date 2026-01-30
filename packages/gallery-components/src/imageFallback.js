/**
 * Image fallback utility - JavaScript version
 * 
 * This is a JavaScript port of the TypeScript image-fallback.ts utility.
 * All fallback strategy logic is defined here to ensure consistency.
 * 
 * If you need to update the fallback strategy, update both:
 * - frontend/dashboard/lib/image-fallback.ts (TypeScript)
 * - packages/gallery-components/src/imageFallback.js (JavaScript)
 * 
 * Fallback strategy:
 * 1. CloudFront URL (primary) - thumb/preview/bigthumb
 * 2. S3 presigned URL fallback (if CloudFront fails with 403)
 * 3. Next size version (thumb → preview → bigthumb)
 * 4. Original photo from S3 (ultimate fallback)
 */

/**
 * Normalize URL by removing query parameters for comparison
 * This handles cache-busting parameters that might be added
 */
function normalizeUrl(url) {
	try {
		const urlObj = new URL(url);
		return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
	} catch {
		return url.split('?')[0]; // Fallback: just remove query string
	}
}

/**
 * Check if two URLs point to the same resource (ignoring query params)
 */
function urlsMatch(url1, url2) {
	if (!url2) {return false;}
	return normalizeUrl(url1) === normalizeUrl(url2);
}

/**
 * Get the initial image URL based on size preference
 * Priority: thumb → preview → bigthumb → original
 */
export function getInitialImageUrl(img, preferredSize = 'thumb') {
	let url;
	if (preferredSize === 'thumb') {
		url = img.thumbUrl || img.previewUrl || img.bigThumbUrl || img.finalUrl || img.url || "";
	} else if (preferredSize === 'preview') {
		url = img.previewUrl || img.bigThumbUrl || img.thumbUrl || img.finalUrl || img.url || "";
	} else {
		// bigthumb: prefer bigThumbUrl, then preview, then thumb, then original
		url = img.bigThumbUrl || img.previewUrl || img.thumbUrl || img.finalUrl || img.url || "";
	}
	
	return url;
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
 * @param attemptedSizes - Set of sizes that have already been attempted (to prevent retrying)
 * @param preferredSize - The initial preferred size (thumb/bigthumb/preview) to determine fallback chain
 */
export function getNextFallbackUrl(currentUrl, img, attemptedSizes, preferredSize) {

	// Check if current URL is a CloudFront URL
	const isCloudFrontUrl = (url) => {
		try {
			const urlObj = new URL(url);
			return urlObj.hostname.includes('cloudfront') || urlObj.hostname.includes('cloudfront.net');
		} catch {
			return false;
		}
	};

	const failedUrl = currentUrl;
	const isCloudFront = isCloudFrontUrl(failedUrl);
	
	// Detect preferred size from failed URL if not provided
	const detectPreferredSize = () => {
		if (preferredSize) return preferredSize;
		const normalized = normalizeUrl(failedUrl);
		if (normalized.includes('/thumbs/')) return 'thumb';
		if (normalized.includes('/bigthumbs/')) return 'bigthumb';
		if (normalized.includes('/previews/')) return 'preview';
		return 'thumb'; // Default
	};
	
	const detectedPreferredSize = detectPreferredSize();

	// Helper to check if a size has been attempted
	const hasAttemptedSize = (size) => {
		return attemptedSizes && attemptedSizes.has(size);
	};

	// Helper to try a CloudFront URL
	const tryCloudFront = (size, url) => {
		if (hasAttemptedSize(size) || !url || urlsMatch(failedUrl, url)) {
			return null;
		}
		// Only return if it's actually a CloudFront URL
		if (!isCloudFrontUrl(url)) {
			return null;
		}
		return url;
	};

	// Helper to try an S3 fallback URL
	const tryS3 = (size, url) => {
		if (hasAttemptedSize(size) || !url || urlsMatch(failedUrl, url)) {
			return null;
		}
		return url;
	};

	// Implement tiered fallback strategy based on preferred size
	if (detectedPreferredSize === 'thumb') {
		// Thumb strategy: CloudFront thumb → bigthumb → preview → S3 thumb → bigthumb → preview → original
		// If CloudFront thumb failed, try CloudFront bigthumb
		const bigThumbCf = tryCloudFront('bigthumb', img.bigThumbUrl);
		if (bigThumbCf) return bigThumbCf;
		
		// If CloudFront bigthumb failed or not available, try CloudFront preview
		const previewCf = tryCloudFront('preview', img.previewUrl);
		if (previewCf) return previewCf;
		
		// All CloudFront options exhausted, try S3 thumb
		const thumbS3 = tryS3('thumb', img.thumbUrlFallback);
		if (thumbS3) return thumbS3;
		
		// If S3 thumb failed or not available, try S3 bigthumb
		const bigThumbS3 = tryS3('bigthumb', img.bigThumbUrlFallback);
		if (bigThumbS3) return bigThumbS3;
		
		// If S3 bigthumb failed or not available, try S3 preview
		const previewS3 = tryS3('preview', img.previewUrlFallback);
		if (previewS3) return previewS3;
		
	} else if (detectedPreferredSize === 'bigthumb') {
		// Bigthumb strategy: CloudFront bigthumb → preview → thumb → S3 bigthumb → preview → thumb → original
		// If CloudFront bigthumb failed, try CloudFront preview
		const previewCf = tryCloudFront('preview', img.previewUrl);
		if (previewCf) return previewCf;
		
		// If CloudFront preview failed or not available, try CloudFront thumb
		const thumbCf = tryCloudFront('thumb', img.thumbUrl);
		if (thumbCf) return thumbCf;
		
		// All CloudFront options exhausted, try S3 bigthumb
		const bigThumbS3 = tryS3('bigthumb', img.bigThumbUrlFallback);
		if (bigThumbS3) return bigThumbS3;
		
		// If S3 bigthumb failed or not available, try S3 preview
		const previewS3 = tryS3('preview', img.previewUrlFallback);
		if (previewS3) return previewS3;
		
		// If S3 preview failed or not available, try S3 thumb
		const thumbS3 = tryS3('thumb', img.thumbUrlFallback);
		if (thumbS3) return thumbS3;
		
	} else if (detectedPreferredSize === 'preview') {
		// Preview strategy: CloudFront preview → thumb → S3 preview → thumb → original
		// If CloudFront preview failed, try CloudFront thumb
		const thumbCf = tryCloudFront('thumb', img.thumbUrl);
		if (thumbCf) return thumbCf;
		
		// All CloudFront options exhausted, try S3 preview
		const previewS3 = tryS3('preview', img.previewUrlFallback);
		if (previewS3) return previewS3;
		
		// If S3 preview failed or not available, try S3 thumb
		const thumbS3 = tryS3('thumb', img.thumbUrlFallback);
		if (thumbS3) return thumbS3;
	}

	// Final fallback: try original photo (S3)
	if (img.finalUrl && !urlsMatch(failedUrl, img.finalUrl)) {
		return img.finalUrl;
	}
	if (img.url && !urlsMatch(failedUrl, img.url)) {
		return img.url;
	}

	console.warn('[ImageFallback] No more fallbacks available for', failedUrl);
	return null;
}

