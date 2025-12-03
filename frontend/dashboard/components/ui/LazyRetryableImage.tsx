import { useState, useEffect, useRef, useMemo } from "react";
import { ImageFallbackUrls, ImageSize, getInitialImageUrl, getNextFallbackUrl, isFinalUrl } from "../../lib/image-fallback";
import { imageFallbackThrottler } from "../../lib/image-fallback-throttler";

interface LazyRetryableImageProps {
  imageData: ImageFallbackUrls;
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
export const LazyRetryableImage: React.FC<LazyRetryableImageProps> = ({
  imageData,
  alt,
  className = "",
  preferredSize = 'thumb',
  rootMargin = "50px",
  placeholder,
  loadingPlaceholder,
  errorPlaceholder,
}) => {
  const [isInView, setIsInView] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [currentSrc, setCurrentSrc] = useState<string>("");
  const fallbackAttemptsRef = useRef<Set<string>>(new Set());
  const attemptedSizesRef = useRef<Set<'thumb' | 'preview' | 'bigthumb'>>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hasInitializedRef = useRef<boolean>(false);

  // Compute initial URL from imageData (cache busting applied automatically)
  // Use useMemo to avoid recomputing on every render
  const initialSrc = useMemo(() => {
    return getInitialImageUrl(imageData, preferredSize);
  }, [imageData, preferredSize]);

  // Reset state when imageData or preferredSize changes (NOT when isInView changes)
  useEffect(() => {
    // Reset initialization flag and state when imageData or preferredSize changes
    hasInitializedRef.current = false;
    
    setIsLoading(true);
    setHasError(false);
    setCurrentSrc(initialSrc);
    fallbackAttemptsRef.current.clear();
    attemptedSizesRef.current.clear();
    
    // Mark initial size as attempted
    attemptedSizesRef.current.add(preferredSize);

    if (!initialSrc) {
      setIsLoading(false);
      setHasError(true);
      return;
    }
    
    hasInitializedRef.current = true;
  }, [imageData, preferredSize, initialSrc, alt]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isInView) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, isInView, alt, currentSrc]);

  const handleLoad = (): void => {
    setIsLoading(false);
    setHasError(false);
    // Record success for circuit breaker
    imageFallbackThrottler.recordSuccess();
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>): void => {
    const failedUrl = e.currentTarget.src;
    
    // Determine which size failed based on URL
    const getSizeFromUrl = (url: string): 'thumb' | 'preview' | 'bigthumb' | null => {
      const normalized = url.split('?')[0]; // Remove query params
      if (normalized.includes('/thumbs/')) return 'thumb';
      if (normalized.includes('/previews/')) return 'preview';
      if (normalized.includes('/bigthumbs/')) return 'bigthumb';
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
    const nextUrl = getNextFallbackUrl(failedUrl, imageData, attemptedSizesRef.current, preferredSize);
    
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
    setIsLoading(false);
    setHasError(true);
  };

  // Not in view yet - show placeholder
  if (!isInView) {
    return (
      <div ref={containerRef} className={className}>
        {placeholder || (
          <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Ładowanie...</div>
          </div>
        )}
      </div>
    );
  }

  // In view - show image with loading/error states
  return (
    <div ref={containerRef} className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg z-10">
          {loadingPlaceholder || (
            <div className="text-xs text-gray-500 dark:text-gray-400">Ładowanie obrazu...</div>
          )}
        </div>
      )}
      {hasError && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg z-10">
          {errorPlaceholder || (
            <div className="text-xs text-gray-500 dark:text-gray-400">Błąd ładowania</div>
          )}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        className={`${className} ${isLoading || hasError ? "opacity-0" : "opacity-100"} transition-opacity`}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
      />
    </div>
  );
};

