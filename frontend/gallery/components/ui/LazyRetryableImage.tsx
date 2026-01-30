/**
 * Lazy-loading image component with progressive fallback strategy for gallery app
 * Based on dashboard's LazyRetryableImage but adapted for gallery app's image structure
 *
 * Features:
 * - Lazy loading: Only loads when image enters viewport (Intersection Observer)
 * - Progressive fallback: CloudFront → S3 presigned → next size → original
 * - Prevents double-loading that causes layout recalculation issues
 * - Uses native <img> tag (not Next.js Image) for better control and performance
 *
 * Fallback strategy:
 * 1. CloudFront URL (primary) - bigthumb/preview/thumb
 * 2. S3 presigned URL fallback (if CloudFront fails with 403)
 * 3. Next size version (bigthumb → preview → thumb)
 * 4. Original photo from S3 (ultimate fallback)
 */

"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
// @ts-ignore - JavaScript module
import { getNextFallbackUrl, getInitialImageUrl } from "../../../../packages/gallery-components/src/imageFallback";

export interface LazyRetryableImageProps {
  image: {
    key: string;
    bigThumbUrl?: string | null;
    bigThumbUrlFallback?: string | null;
    previewUrl?: string | null;
    previewUrlFallback?: string | null;
    thumbUrl?: string | null;
    thumbnailUrl?: string | null;
    thumbUrlFallback?: string | null;
    url?: string | null;
    finalUrl?: string | null;
    lastModified?: string | number;
    [key: string]: any;
  };
  alt?: string;
  className?: string;
  fill?: boolean; // For gallery app compatibility - uses absolute positioning
  sizes?: string; // Not used with native img, but kept for API compatibility
  priority?: boolean; // If true, loads immediately without IntersectionObserver
  preferredSize?: "thumb" | "preview" | "bigthumb";
  onLoadingComplete?: (img: HTMLImageElement) => void;
  onFallback?: () => void; // Called when image falls back from preferred size
  rootMargin?: string; // Intersection Observer root margin (default: "200px" for prefetching)
}

export function LazyRetryableImage({
  image,
  alt = "",
  className = "",
  fill = false,
  sizes,
  priority = false,
  preferredSize = "bigthumb",
  onLoadingComplete,
  onFallback,
  rootMargin = "200px", // Prefetch images 200px before they become visible
}: LazyRetryableImageProps) {
  const [isInView, setIsInView] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  // Initialize currentSrc from initialSrc to ensure it's set on first render
  const [currentSrc, setCurrentSrc] = useState<string>(() => {
    const initial = getInitialImageUrl(image, preferredSize);
    return initial || "";
  });
  const fallbackAttemptsRef = useRef<Set<string>>(new Set());
  const attemptedSizesRef = useRef<Set<"thumb" | "preview" | "bigthumb">>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const previousImageKeyRef = useRef<string | null>(null);
  // Track if we've already handled the load to prevent race conditions
  const loadHandledRef = useRef<boolean>(false);
  // Track current loading state in a ref to avoid stale closures
  const isLoadingRef = useRef<boolean>(true);

  // Generate stable identifier for the image
  const imageIdentifier = useMemo(() => {
    return image.key ?? alt;
  }, [image.key, alt]);

  // Create a stable signature of image data for comparison
  const imageDataSignature = useMemo(() => {
    const urlSet = new Set<string>();
    [
      image.thumbUrl,
      image.thumbUrlFallback,
      image.thumbnailUrl,
      image.previewUrl,
      image.previewUrlFallback,
      image.bigThumbUrl,
      image.bigThumbUrlFallback,
      image.url,
      image.finalUrl,
    ]
      .filter(Boolean)
      .forEach((url) => urlSet.add(url || ""));

    const normalizedUrls = Array.from(urlSet).sort().join("|");
    const normalizedLastModified =
      image.lastModified !== undefined
        ? typeof image.lastModified === "string"
          ? Math.round(new Date(image.lastModified).getTime() / 1000) * 1000
          : Math.round(image.lastModified / 1000) * 1000
        : undefined;

    return {
      identifier: imageIdentifier,
      urls: normalizedUrls,
      lastModified: normalizedLastModified,
    };
  }, [
    imageIdentifier,
    image.thumbUrl,
    image.thumbUrlFallback,
    image.thumbnailUrl,
    image.previewUrl,
    image.previewUrlFallback,
    image.bigThumbUrl,
    image.bigThumbUrlFallback,
    image.url,
    image.finalUrl,
    image.lastModified,
  ]);

  // Reset state only when actual image data changes (not just object reference)
  useEffect(() => {
    const previous = previousImageKeyRef.current;
    const current = imageDataSignature.identifier;

    // Only reset if image actually changed
    if (previous === current && hasInitializedRef.current) {
      // Same image - preserve state, don't reset
      if (!currentSrc) {
        const freshInitialSrc = getInitialImageUrl(image, preferredSize);
        if (freshInitialSrc) {
          setCurrentSrc(freshInitialSrc);
        }
      }
      previousImageKeyRef.current = current;
      return;
    }

    // Image changed or data changed - reset state
    const freshInitialSrc = getInitialImageUrl(image, preferredSize);

    hasInitializedRef.current = false;
    loadHandledRef.current = false;
    isLoadingRef.current = true;

    setIsLoading(true);
    setHasError(false);
    setCurrentSrc(freshInitialSrc || "");
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
    previousImageKeyRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataSignature, preferredSize]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    // If priority is true, load immediately (no lazy loading)
    if (priority) {
      setIsInView(true);
      return;
    }

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
      { rootMargin } // Prefetch images before they become visible
    );

    // Check if element is already in view before observing
    const rect = containerRef.current.getBoundingClientRect();
    const isAlreadyInView = rect.top < window.innerHeight + 200 && rect.bottom > -200;

    // If already in view, set isInView immediately instead of waiting for observer callback
    if (isAlreadyInView && !isInView) {
      setIsInView(true);
      observer.disconnect();
      return;
    }

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, isInView, alt, currentSrc, priority]);

  const handleLoad = (): void => {
    // Prevent duplicate calls
    if (loadHandledRef.current) {
      return;
    }
    loadHandledRef.current = true;
    isLoadingRef.current = false;
    setIsLoading(false);
    setHasError(false);
    // Note: We don't call onLoadingComplete here - dimension extraction is handled via event delegation in VirtuosoGrid
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>): void => {
    const failedUrl = e.currentTarget.src;

    // Determine which size failed based on URL
    const getSizeFromUrl = (url: string): "thumb" | "preview" | "bigthumb" | null => {
      const normalized = url.split("?")[0];
      if (normalized.includes("/thumbs/") || normalized.includes("/thumb/")) {
        return "thumb";
      }
      if (normalized.includes("/previews/") || normalized.includes("/preview/")) {
        return "preview";
      }
      if (normalized.includes("/bigthumbs/") || normalized.includes("/bigthumb/")) {
        return "bigthumb";
      }
      return null;
    };

    const failedSize = getSizeFromUrl(failedUrl);
    if (failedSize) {
      attemptedSizesRef.current.add(failedSize);
    }

    // Prevent infinite fallback loops
    if (fallbackAttemptsRef.current.has(failedUrl)) {
      setIsLoading(false);
      setHasError(true);
      return;
    }
    fallbackAttemptsRef.current.add(failedUrl);

    const attemptCount = fallbackAttemptsRef.current.size;

    // Try progressive fallback
    const nextUrl = getNextFallbackUrl(
      failedUrl,
      image,
      attemptedSizesRef.current,
      preferredSize
    );

    if (nextUrl && !fallbackAttemptsRef.current.has(nextUrl)) {
      // Mark the size of the next URL as attempted
      const nextSize = getSizeFromUrl(nextUrl);
      if (nextSize) {
        attemptedSizesRef.current.add(nextSize);
      }
      
      // Notify parent that we're falling back from preferred size
      // Only notify if we're falling back from the preferred size (bigthumb)
      if (preferredSize === "bigthumb" && failedSize === "bigthumb" && onFallback) {
        onFallback();
      }

      // Add exponential backoff delay to prevent DDoS when many images fail simultaneously
      const backoffDelay = Math.min(100 * Math.pow(2, attemptCount), 2000);

      // Retry with exponential backoff
      setTimeout(() => {
        setCurrentSrc(nextUrl);
        setIsLoading(true);
        setHasError(false);
        // Note: We don't reset loadHandledRef here - let the new image load trigger handleLoad
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
      // Note: We don't call onLoadingComplete here - dimension extraction is handled via event delegation in VirtuosoGrid
    }
  }, [isInView, currentSrc, imageIdentifier, onLoadingComplete]);

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
        // Note: We don't call onLoadingComplete here - dimension extraction is handled via event delegation in VirtuosoGrid
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
  }, [isInView, currentSrc, imageIdentifier, onLoadingComplete]);

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
  if (!isInView && !priority) {
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
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg">
          <div className="text-xs text-gray-500 dark:text-gray-400">Ładowanie...</div>
        </div>
      </div>
    );
  }

  // In view - show image with loading/error states

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Spacer in normal flow to maintain container height when img is loading */}
      {/* This prevents the narrow bar issue when switching tabs */}
      {/* Always render spacer when loading/error to prevent initial collapse */}
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
          width: fill ? "100%" : "100%",
          height: fill ? "100%" : "100%",
          objectFit: "cover",
          ...(fill && {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }),
        }}
        onError={handleError}
        onLoad={handleLoad}
        loading={priority ? "eager" : "lazy"}
      />
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg z-10">
          <div className="text-xs text-gray-500 dark:text-gray-400">Ładowanie obrazu...</div>
        </div>
      )}
      {hasError && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg z-10">
          <div className="text-xs text-gray-500 dark:text-gray-400">Błąd ładowania</div>
        </div>
      )}
    </div>
  );
}
