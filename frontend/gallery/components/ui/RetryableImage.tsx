/**
 * Robust image component with progressive fallback strategy for gallery app
 *
 * Fallback strategy:
 * 1. CloudFront URL (primary) - bigthumb/preview/thumb
 * 2. S3 presigned URL fallback (if CloudFront fails with 403)
 * 3. Next size version (bigthumb → preview → thumb)
 * 4. Original photo from S3 (ultimate fallback)
 *
 * This ensures robust, fail-free image loading even when CloudFront returns 403 errors.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
// @ts-ignore - JavaScript module
import { getNextFallbackUrl, getInitialImageUrl } from "../../../../packages/gallery-components/src/imageFallback";

export interface RetryableImageProps {
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
    [key: string]: any; // Allow additional properties from ImageData
  };
  alt?: string;
  className?: string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  loading?: "lazy" | "eager" | undefined;
  preferredSize?: "thumb" | "preview" | "bigthumb";
  onLoadingComplete?: (img: HTMLImageElement) => void;
}

export function RetryableImage({
  image,
  alt = "",
  className = "",
  fill = false,
  sizes,
  priority = false,
  loading,
  preferredSize = "bigthumb",
  onLoadingComplete,
}: RetryableImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const fallbackAttemptsRef = useRef<Set<string>>(new Set());
  const attemptedSizesRef = useRef<Set<"thumb" | "preview" | "bigthumb">>(new Set());

  useEffect(() => {
    // Reset state when image changes
    const initialSrc = getInitialImageUrl(image, preferredSize);
    setCurrentSrc(initialSrc || "");
    setIsLoading(true);
    setHasError(false);
    fallbackAttemptsRef.current.clear();
    attemptedSizesRef.current.clear();
  }, [image.key, image.bigThumbUrl, image.previewUrl, image.thumbUrl, preferredSize]);

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
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RetryableImage.tsx:110',message:'Image fallback triggered',data:{imageKey:image.key,failedUrl,nextUrl,nextSize},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      // Try next fallback URL
      setCurrentSrc(nextUrl);
      setIsLoading(true);
      setHasError(false);
      return;
    }

    // No more fallbacks available
    setIsLoading(false);
    setHasError(true);
  };

  const handleLoad = (img: HTMLImageElement) => {
    setIsLoading(false);
    setHasError(false);
    if (onLoadingComplete) {
      onLoadingComplete(img);
    }
  };

  if (!currentSrc) {
    return null;
  }

  if (fill) {
    return (
      <Image
        src={currentSrc}
        alt={alt}
        fill
        className={className}
        sizes={sizes}
        priority={priority}
        loading={loading}
        unoptimized={currentSrc.startsWith("http")}
        onError={handleError}
        onLoadingComplete={handleLoad}
      />
    );
  }

  return (
    <Image
      src={currentSrc}
      alt={alt}
      className={className}
      sizes={sizes}
      priority={priority}
      loading={loading}
      unoptimized={currentSrc.startsWith("http")}
      onError={handleError}
      onLoadingComplete={handleLoad}
    />
  );
}
