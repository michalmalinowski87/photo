import { useState, useEffect, useRef } from "react";

interface RetryableImageProps {
  src: string;
  alt: string;
  className?: string;
  maxRetries?: number;
  initialDelay?: number;
}

// Component that retries loading an image until it's available on CloudFront
export const RetryableImage: React.FC<RetryableImageProps> = ({
  src,
  alt,
  className = "",
  maxRetries = 30,
  initialDelay = 500,
}) => {
  const [imageSrc, setImageSrc] = useState<string>(src);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    // Reset when src changes
    setImageSrc(src);
    retryCountRef.current = 0;

    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Check if image is already cached before showing loading spinner
    if (src) {
      const testImg = new Image();
      testImg.onload = () => {
        // Image is cached - don't show spinner
        setIsLoading(false);
      };
      testImg.onerror = () => {
        // Image not cached - show spinner
        setIsLoading(true);
      };
      testImg.src = src;

      // If image doesn't load quickly (100ms), assume it needs loading
      const timeout = setTimeout(() => {
        if (!testImg.complete) {
          setIsLoading(true);
        }
      }, 100);

      // Force image reload by clearing and setting src
      if (imgRef.current) {
        imgRef.current.src = "";
        setTimeout(() => {
          if (imgRef.current && src) {
            imgRef.current.src = src;
          }
        }, 0);
      }

      return () => clearTimeout(timeout);
    } else {
      setIsLoading(true);
      return undefined;
    }
  }, [src]);

  const handleError = (): void => {
    retryCountRef.current += 1;
    const currentRetryCount = retryCountRef.current;

    if (currentRetryCount < maxRetries) {
      setIsLoading(true);

      // Exponential backoff: start with initialDelay, increase gradually
      const delay = Math.min(initialDelay * Math.pow(1.2, currentRetryCount - 1), 5000);

      retryTimeoutRef.current = setTimeout(() => {
        // Add cache-busting query parameter
        const separator = src.includes("?") ? "&" : "?";
        const retryUrl = `${src}${separator}_t=${Date.now()}&_r=${currentRetryCount}`;

        setImageSrc(retryUrl);

        // Force reload the image
        if (imgRef.current) {
          imgRef.current.src = retryUrl;
        }
      }, delay);
    } else {
      setIsLoading(false);
    }
  };

  const handleLoad = (): void => {
    setIsLoading(false);
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    // Cleanup timeout on unmount
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg z-10">
          <div className="text-xs text-gray-500 dark:text-gray-400">Ładowanie obrazu...</div>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={`${className} ${isLoading ? "opacity-0" : "opacity-100"} transition-opacity`}
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  );
};
