import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";

import {
  ImageFallbackUrls,
  ImageSize,
  getInitialImageUrl,
  getNextFallbackUrl,
} from "../../lib/image-fallback";
import { imageFallbackThrottler } from "../../lib/image-fallback-throttler";

interface LazyRetryableImageProps {
  imageData: ImageFallbackUrls & {
    key?: string;
    filename?: string;
  };
  alt: string;
  className?: string;
  preferredSize?: ImageSize; // Preferred size for initial load (thumb/preview/bigthumb)
  rootMargin?: string; // Intersection Observer root margin (default: "50px")
  placeholder?: React.ReactNode; // Custom placeholder while not in view
  loadingPlaceholder?: React.ReactNode; // Custom placeholder while loading
  errorPlaceholder?: React.ReactNode; // Custom placeholder on error
}

/**
 * Unified image component that combines lazy loading and progressive fallback.
 *
 * Features:
 * - Lazy loading: Only loads when image enters viewport (Intersection Observer)
 * - Progressive fallback: CloudFront → S3 presigned → next size → original
 * - Single source of truth: All fallback logic in image-fallback.ts
 *
 * Fallback strategy (defined in image-fallback.ts):
 * 1. CloudFront URL (primary) - thumb/preview/bigthumb
 * 2. S3 presigned URL fallback (if CloudFront fails with 403)
 * 3. Next size version (thumb → preview → bigthumb)
 * 4. Original photo from S3 (ultimate fallback)
 */
export const LazyRetryableImage = ({
  imageData,
  alt,
  className = "",
  preferredSize = "thumb",
  rootMargin = "50px",
  placeholder,
  loadingPlaceholder,
  errorPlaceholder,
}: LazyRetryableImageProps) => {
  const [isInView, setIsInView] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  // Initialize currentSrc from initialSrc to ensure it's set on first render
  const [currentSrc, setCurrentSrc] = useState<string>(() => {
    const initial = getInitialImageUrl(imageData, preferredSize);
    return initial || "";
  });
  const fallbackAttemptsRef = useRef<Set<string>>(new Set());
  const attemptedSizesRef = useRef<Set<"thumb" | "preview" | "bigthumb">>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const previousImageDataRef = useRef<{
    identifier: string;
    urls: string;
    lastModified: string | number | undefined;
  } | null>(null);
  // Track if we've already handled the load to prevent race conditions
  const loadHandledRef = useRef<boolean>(false);
  // Track current loading state in a ref to avoid stale closures
  const isLoadingRef = useRef<boolean>(true);

  // Generate stable identifier for the image (key or filename, or fallback to alt)
  const imageIdentifier = useMemo(() => {
    return imageData.key ?? imageData.filename ?? alt;
  }, [imageData.key, imageData.filename, alt]);

  // Normalize URL by removing query parameters for comparison
  // This ensures cache-busting parameters don't cause false positives
  const normalizeUrlForComparison = (url: string | null | undefined): string => {
    if (!url) {
      return "";
    }
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      // If URL parsing fails, remove query string manually
      return url.split("?")[0];
    }
  };

  // Create a stable signature of image data for comparison
  // This allows us to detect actual data changes vs just object reference changes
  // URLs are normalized (query params removed) to avoid cache-busting false positives
  const imageDataSignature = useMemo(() => {
    // Collect all normalized URLs and sort them for consistent comparison
    // This handles cases where URLs might be in different order or some might be missing
    // Use a Set to deduplicate URLs (in case thumbUrl and thumbUrlFallback point to same resource)
    const urlSet = new Set<string>();

    [
      normalizeUrlForComparison(imageData.thumbUrl),
      normalizeUrlForComparison(imageData.thumbUrlFallback),
      normalizeUrlForComparison(imageData.previewUrl),
      normalizeUrlForComparison(imageData.previewUrlFallback),
      normalizeUrlForComparison(imageData.bigThumbUrl),
      normalizeUrlForComparison(imageData.bigThumbUrlFallback),
      normalizeUrlForComparison(imageData.url),
      normalizeUrlForComparison(imageData.finalUrl),
    ]
      .filter(Boolean)
      .forEach((url) => urlSet.add(url));

    const normalizedUrls = Array.from(urlSet).sort().join("|");

    // Normalize lastModified for comparison (convert to number if string)
    // Use a more lenient comparison - round to nearest second to handle precision differences
    const normalizedLastModified =
      imageData.lastModified !== undefined
        ? typeof imageData.lastModified === "string"
          ? Math.round(new Date(imageData.lastModified).getTime() / 1000) * 1000
          : Math.round(imageData.lastModified / 1000) * 1000
        : undefined;

    return {
      identifier: imageIdentifier,
      urls: normalizedUrls,
      lastModified: normalizedLastModified,
    };
  }, [
    imageIdentifier,
    imageData.thumbUrl,
    imageData.thumbUrlFallback,
    imageData.previewUrl,
    imageData.previewUrlFallback,
    imageData.bigThumbUrl,
    imageData.bigThumbUrlFallback,
    imageData.url,
    imageData.finalUrl,
    imageData.lastModified,
  ]);

  // Reset state only when actual image data changes (not just object reference)
  useEffect(() => {
    const previous = previousImageDataRef.current;
    const current = imageDataSignature;

    // Check if this is the same image with the same data
    // lastModified is already normalized to nearest second in imageDataSignature
    const lastModifiedMatch = previous?.lastModified === current.lastModified;

    const isSameImage =
      previous &&
      previous.identifier === current.identifier &&
      previous.urls === current.urls &&
      lastModifiedMatch;

    // Only reset if:
    // 1. First time (no previous data)
    // 2. Different image (identifier changed)
    // 3. Image data actually changed (URLs or lastModified changed significantly)
    // 4. Preferred size changed
    if (isSameImage && previousImageDataRef.current) {
      // Same image with same data - preserve state, don't reset
      // Only set currentSrc if it's empty (shouldn't happen with useState initializer, but safety check)
      if (!currentSrc) {
        const freshInitialSrc = getInitialImageUrl(imageData, preferredSize);
        if (freshInitialSrc) {
          setCurrentSrc(freshInitialSrc);
        }
      }
      // Update the ref to track current state
      previousImageDataRef.current = current;
      // Don't reset anything - preserve all state including loading/error states
      return;
    }

    // Image changed or data changed - reset state

    // Compute initialSrc fresh from current imageData to ensure we have latest value
    const freshInitialSrc = getInitialImageUrl(imageData, preferredSize);

    hasInitializedRef.current = false;
    loadHandledRef.current = false; // Reset load handled flag
    isLoadingRef.current = true; // Update ref

    setIsLoading(true);
    setHasError(false);
    setCurrentSrc(freshInitialSrc);
    fallbackAttemptsRef.current.clear();
    attemptedSizesRef.current.clear();

    // Mark initial size as attempted
    attemptedSizesRef.current.add(preferredSize);

    if (!freshInitialSrc) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    hasInitializedRef.current = true;
    previousImageDataRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataSignature, preferredSize]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isInView) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    // Check if element is already in view before observing
    const rect = containerRef.current.getBoundingClientRect();
    const isAlreadyInView = rect.top < window.innerHeight + 50 && rect.bottom > -50;

    // If already in view, set isInView immediately instead of waiting for observer callback
    // This prevents the !isInView placeholder from showing when element is already visible
    if (isAlreadyInView && !isInView) {
      setIsInView(true);
      observer.disconnect();
      return;
    }

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, isInView, alt, currentSrc]);

  const handleLoad = (): void => {
    // Prevent duplicate calls
    if (loadHandledRef.current) {
      return;
    }
    loadHandledRef.current = true;
    isLoadingRef.current = false; // Update ref
    setIsLoading(false);
    setHasError(false);
    // Record success for circuit breaker
    imageFallbackThrottler.recordSuccess();
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>): void => {
    const failedUrl = e.currentTarget.src;

    // Determine which size failed based on URL
    const getSizeFromUrl = (url: string): "thumb" | "preview" | "bigthumb" | null => {
      const normalized = url.split("?")[0]; // Remove query params
      if (normalized.includes("/thumbs/")) {
        return "thumb";
      }
      if (normalized.includes("/previews/")) {
        return "preview";
      }
      if (normalized.includes("/bigthumbs/")) {
        return "bigthumb";
      }
      return null;
    };

    // Track which size failed (if it's a size variant)
    // Note: We DON'T skip size-based fallbacks just because the initial URL was final
    // Sizes might exist on S3 even if they don't exist on CloudFront
    const failedSize = getSizeFromUrl(failedUrl);
    if (failedSize) {
      attemptedSizesRef.current.add(failedSize);
    }
    // If it's not a size variant (i.e., it's the final/original), we don't mark sizes as attempted
    // This allows the fallback chain to still try available sizes (e.g., S3 presigned thumb/preview/bigthumb)

    // Prevent infinite fallback loops
    if (fallbackAttemptsRef.current.has(failedUrl)) {
      setIsLoading(false);
      setHasError(true);
      return;
    }
    fallbackAttemptsRef.current.add(failedUrl);

    const attemptCount = fallbackAttemptsRef.current.size;

    // Try progressive fallback (strategy defined in image-fallback.ts)
    // Cache busting is applied automatically in getNextFallbackUrl
    // Pass attempted sizes and preferred size to determine correct fallback chain
    const nextUrl = getNextFallbackUrl(
      failedUrl,
      imageData,
      attemptedSizesRef.current,
      preferredSize
    );

    if (nextUrl && !fallbackAttemptsRef.current.has(nextUrl)) {
      // Mark the size of the next URL as attempted
      const nextSize = getSizeFromUrl(nextUrl);
      if (nextSize) {
        attemptedSizesRef.current.add(nextSize);
      }

      // Add exponential backoff delay to prevent DDoS when many images fail simultaneously
      // This prevents all 800+ images from cascading through fallbacks at once
      const backoffDelay = Math.min(100 * Math.pow(2, attemptCount), 2000); // Max 2 seconds

      // Check circuit breaker before retrying
      if (imageFallbackThrottler.isCircuitOpen()) {
        setIsLoading(false);
        setHasError(true);
        return;
      }

      // Record failure for circuit breaker tracking
      imageFallbackThrottler.recordFailure();

      // Retry with exponential backoff
      setTimeout(() => {
        setCurrentSrc(nextUrl);
        setIsLoading(true);
        setHasError(false);
      }, backoffDelay);

      return;
    }

    // No more fallbacks available
    isLoadingRef.current = false;
    setIsLoading(false);
    setHasError(true);
  };

  // Check if image is already complete when rendering (cached images)
  // MUST be before conditional return to follow Rules of Hooks
  // This handles the case where cached images load instantly before onLoad fires
  // useLayoutEffect runs synchronously after DOM mutations, perfect for checking cached images
  useLayoutEffect(() => {
    if (!isInView || !currentSrc || !imgRef.current || loadHandledRef.current) return;

    const img = imgRef.current;
    // If image is already complete (cached), trigger load handler immediately
    // Use ref to check current loading state to avoid stale closures
    // CRITICAL: Check img.src matches currentSrc to handle tab switching where src might change
    const srcMatches = img.src === currentSrc;
    if (
      srcMatches &&
      img.complete &&
      img.naturalWidth > 0 &&
      img.naturalHeight > 0 &&
      isLoadingRef.current &&
      !loadHandledRef.current
    ) {
      loadHandledRef.current = true;
      isLoadingRef.current = false;
      setIsLoading(false);
      setHasError(false);
      imageFallbackThrottler.recordSuccess();
    }
  }, [isInView, currentSrc, imageIdentifier]);

  // Also check with useEffect as a fallback for async cases and when src changes
  // This is critical for tab switching - cached images load instantly
  useEffect(() => {
    if (!isInView || !currentSrc) return;

    const checkImageComplete = () => {
      if (!imgRef.current || loadHandledRef.current) return;
      const img = imgRef.current;
      // If image is already complete (cached), trigger load handler
      // Use ref to check current state to avoid stale closure issues
      // CRITICAL: Check img.src matches currentSrc to handle tab switching where src might change
      const srcMatches = img.src === currentSrc;
      if (
        srcMatches &&
        img.complete &&
        img.naturalWidth > 0 &&
        img.naturalHeight > 0 &&
        isLoadingRef.current &&
        !loadHandledRef.current
      ) {
        loadHandledRef.current = true;
        isLoadingRef.current = false;
        setIsLoading(false);
        setHasError(false);
        imageFallbackThrottler.recordSuccess();
      }
    };

    // Check immediately when src changes (for cached images when switching tabs)
    // Use multiple strategies to catch images that load instantly
    checkImageComplete();

    // Also check after short delays to catch images that load very quickly
    const timeoutId1 = setTimeout(checkImageComplete, 0);
    const timeoutId2 = setTimeout(checkImageComplete, 10);
    const timeoutId3 = setTimeout(checkImageComplete, 50);
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(checkImageComplete);
    });

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      cancelAnimationFrame(rafId);
    };
  }, [isInView, currentSrc, imageIdentifier]);

  // Sync ref with state changes
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Ensure container maintains parent's explicit dimensions to prevent collapse
  // MUST be before conditional return to follow Rules of Hooks
  // Run regardless of isInView to catch collapse even during initial render
  useLayoutEffect(() => {
    if (containerRef.current) {
      const parent = containerRef.current.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      const rect = containerRef.current.getBoundingClientRect();

      // If container has collapsed (height < 50px) but parent has explicit dimensions, force it to maintain size
      // This prevents the narrow bar issue when switching tabs
      // Check even when isInView is false to prevent initial collapse
      if (rect.height < 50 && parentRect && parentRect.height > 50) {
        // Force container to maintain parent's height immediately
        if (containerRef.current) {
          containerRef.current.style.minHeight = `${parentRect.height}px`;
        }
      }
    }
  }, [isLoading, hasError, imageIdentifier, isInView]);

  // Not in view yet - show placeholder
  if (!isInView) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          // Ensure placeholder container also maintains parent's dimensions
          // This prevents collapse during initial render before isInView becomes true
          minHeight: "200px",
        }}
      >
        {placeholder ?? (
          <div className="w-full h-full bg-photographer-elevated dark:bg-gray-800 flex items-center justify-center rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Ładowanie...</div>
          </div>
        )}
      </div>
    );
  }

  // In view - show image with loading/error states

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Spacer in normal flow to maintain container height when img is loading */}
      {/* This prevents the narrow bar issue when switching tabs */}
      {/* Always render spacer when loading/error to prevent initial collapse */}
      {/* The parent has explicit dimensions (288×216 = 4:3), so we use that aspect ratio */}
      {(isLoading || hasError) && (
        <div
          className="w-full"
          aria-hidden="true"
          style={{
            pointerEvents: "none",
            // Use padding-bottom trick to create height based on container width
            // 75% = 4:3 aspect ratio to match common image dimensions
            paddingBottom: "75%",
            height: 0,
          }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        className={`${className} ${isLoading || hasError ? "opacity-0 absolute inset-0" : "opacity-100"} transition-opacity`}
        style={{
          // Ensure img maintains container dimensions
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
      />
      {isLoading && (
        <div className="absolute inset-0 bg-photographer-elevated dark:bg-gray-800 flex items-center justify-center rounded-lg z-10">
          {loadingPlaceholder ?? (
            <div className="text-xs text-gray-500 dark:text-gray-400">Ładowanie obrazu...</div>
          )}
        </div>
      )}
      {hasError && (
        <div className="absolute inset-0 bg-photographer-elevated dark:bg-gray-800 flex items-center justify-center rounded-lg z-10">
          {errorPlaceholder ?? (
            <div className="text-xs text-gray-500 dark:text-gray-400">Błąd ładowania</div>
          )}
        </div>
      )}
    </div>
  );
};
