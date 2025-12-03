import { useState, useEffect, useRef } from "react";
import { ImageFallbackUrls, ImageSize, getNextFallbackUrl, createImageErrorHandler } from "../../lib/image-fallback";

interface RetryableImageProps {
  src: string;
  alt: string;
  className?: string;
  imageData?: ImageFallbackUrls; // Optional: provide full image data for fallback
  preferredSize?: ImageSize; // Preferred size for initial load
}

/**
 * Robust image component with progressive fallback strategy.
 * 
 * Fallback strategy:
 * 1. CloudFront URL (primary) - thumb/preview/bigthumb
 * 2. S3 presigned URL fallback (if CloudFront fails with 403)
 * 3. Next size version (thumb → preview → bigthumb)
 * 4. Original photo from S3 (ultimate fallback)
 * 
 * This ensures robust, fail-free image loading even when CloudFront returns 403 errors.
 */
import { getInitialImageUrl } from "../../lib/image-fallback";

export const RetryableImage: React.FC<RetryableImageProps> = ({
  src,
  alt,
  className = "",
  imageData,
  preferredSize = 'thumb',
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  // Use imageData to compute initial URL if available, otherwise use src
  const initialSrc = imageData ? getInitialImageUrl(imageData, preferredSize) : src;
  const [currentSrc, setCurrentSrc] = useState<string>(initialSrc);
  const fallbackAttemptsRef = useRef<Set<string>>(new Set());
  const attemptedSizesRef = useRef<Set<'thumb' | 'preview' | 'bigthumb'>>(new Set());

  useEffect(() => {
    // Reset state when src or imageData changes
    const newSrc = imageData ? getInitialImageUrl(imageData, preferredSize) : src;
    setIsLoading(true);
    setHasError(false);
    setCurrentSrc(newSrc);
    fallbackAttemptsRef.current.clear();
    attemptedSizesRef.current.clear();
    if (imageData) {
      attemptedSizesRef.current.add(preferredSize);
    }

    if (!newSrc) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    // Check if image is already cached
    const testImg = new Image();
    testImg.onload = () => {
      setIsLoading(false);
    };
    testImg.onerror = () => {
      setIsLoading(false);
      setHasError(true);
    };
    testImg.src = newSrc;

    // If image doesn't load quickly (100ms), assume it needs loading
    const timeout = setTimeout(() => {
      if (!testImg.complete) {
        setIsLoading(true);
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [src, imageData, preferredSize]);

  const handleLoad = (): void => {
    setIsLoading(false);
    setHasError(false);
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
    
    const failedSize = getSizeFromUrl(failedUrl);
    if (failedSize && imageData) {
      attemptedSizesRef.current.add(failedSize);
    }
    
    // Prevent infinite fallback loops
    if (fallbackAttemptsRef.current.has(failedUrl)) {
      setIsLoading(false);
      setHasError(true);
      return;
    }
    fallbackAttemptsRef.current.add(failedUrl);

    // If imageData is provided, try progressive fallback
    if (imageData) {
      const nextUrl = getNextFallbackUrl(failedUrl, imageData, attemptedSizesRef.current, preferredSize);
      if (nextUrl && !fallbackAttemptsRef.current.has(nextUrl)) {
        // Mark the size of the next URL as attempted
        const nextSize = getSizeFromUrl(nextUrl);
        if (nextSize) {
          attemptedSizesRef.current.add(nextSize);
        }
        // Try next fallback URL
        setCurrentSrc(nextUrl);
        setIsLoading(true);
        setHasError(false);
        return;
      }
    }

    // No more fallbacks available
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <div className="relative w-full h-full">
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentSrc}
        alt={alt}
        className={`${className} ${isLoading || hasError ? "opacity-0" : "opacity-100"} transition-opacity`}
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  );
};
