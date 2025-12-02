import { useState, useEffect } from "react";

interface RetryableImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Simplified image component that displays images with basic loading state.
 * 
 * Image URL resolution logic:
 * - If thumbUrl exists (processed thumbnail) → use CloudFront URL (optimized)
 * - If thumbUrl doesn't exist → use S3 direct URL (unprocessed)
 * 
 * This logic is handled by the parent component when selecting the src.
 * This component just displays the image with a simple loading state.
 */
export const RetryableImage: React.FC<RetryableImageProps> = ({
  src,
  alt,
  className = "",
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    // Reset state when src changes
    setIsLoading(true);
    setHasError(false);

    if (!src) {
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
    testImg.src = src;

    // If image doesn't load quickly (100ms), assume it needs loading
    const timeout = setTimeout(() => {
      if (!testImg.complete) {
        setIsLoading(true);
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [src]);

  const handleLoad = (): void => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = (): void => {
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
        src={src}
        alt={alt}
        className={`${className} ${isLoading || hasError ? "opacity-0" : "opacity-100"} transition-opacity`}
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  );
};
