"use client";

import React, { memo } from "react";
import { apiFetch } from "@/lib/api";
import { CoverAreaLoading } from "@/components/ui/CoverAreaLoading";
import { PhotoCloudMark } from "@/components/branding/PhotoCloudMark";
import { getQuoteForGallery, getRotatingQuoteForGallery } from "@/lib/quotes";

export interface GalleryPublicInfo {
  galleryName: string | null;
  coverPhotoUrl: string | null;
  loginPageLayout?: string | null;
  coverPhotoPosition?: {
    x?: number;
    y?: number;
    scale?: number;
    objectPosition?: string;
  } | null;
}

interface LoginCoverPaneProps {
  galleryId: string;
  apiUrl: string;
  onPublicInfoLoaded?: (info: GalleryPublicInfo) => void;
  onPublicInfoLoadingChange?: (loading: boolean) => void;
  loginPageLayout?: string | null;
}

export const LoginCoverPane = memo(function LoginCoverPane({
  galleryId,
  apiUrl,
  onPublicInfoLoaded,
  onPublicInfoLoadingChange,
  loginPageLayout,
}: LoginCoverPaneProps) {
  const [publicInfo, setPublicInfo] = React.useState<GalleryPublicInfo | null>(null);
  // Start with the cover loader visible (per requested UX).
  const [isLoading, setIsLoading] = React.useState(true);
  const fetchControllerRef = React.useRef<AbortController | null>(null);
  const lastFetchedRef = React.useRef<{ galleryId: string; apiUrl: string } | null>(null);

  React.useEffect(() => {
    if (!galleryId || !apiUrl) {
      // If we can't fetch yet, keep loader until we can.
      // But ensure parent knows we're still loading
      if (!galleryId || !apiUrl) {
        onPublicInfoLoadingChange?.(true);
      }
      return;
    }

    // If we already fetched for this exact galleryId/apiUrl combination, don't fetch again
    if (
      lastFetchedRef.current &&
      lastFetchedRef.current.galleryId === galleryId &&
      lastFetchedRef.current.apiUrl === apiUrl &&
      publicInfo !== null
    ) {
      return;
    }

    // If there's already a fetch in progress, abort it and start a new one
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }

    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setIsLoading(true);
    onPublicInfoLoadingChange?.(true);

    (async () => {
      try {
        // Add cache-busting parameter to ensure we get the latest position data
        const cacheBuster = `_t=${Date.now()}`;
        const separator = apiUrl.includes("?") ? "&" : "?";
        const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/public-info${separator}${cacheBuster}`, {
          method: "GET",
          signal: controller.signal,
        });

        const info = data as GalleryPublicInfo;
        setPublicInfo(info);
        lastFetchedRef.current = { galleryId, apiUrl };
        onPublicInfoLoaded?.(info);
      } catch {
        // Non-blocking: if we can't load public info, assume no cover and show PhotoCloud fallback.
        setPublicInfo({ 
          galleryName: null, 
          coverPhotoUrl: null,
          loginPageLayout: null,
          coverPhotoPosition: null,
        });
      } finally {
        // Only update state if this request wasn't aborted
        if (!controller.signal.aborted) {
          setIsLoading(false);
          onPublicInfoLoadingChange?.(false);
          fetchControllerRef.current = null;
        }
      }
    })();

    return () => {
      controller.abort();
      fetchControllerRef.current = null;
    };
  }, [galleryId, apiUrl, onPublicInfoLoaded, onPublicInfoLoadingChange]);

  const coverPhotoUrl = publicInfo?.coverPhotoUrl || null;
  const coverPhotoPosition = publicInfo?.coverPhotoPosition;
  const isResolved = publicInfo !== null;
  const layout = loginPageLayout || publicInfo?.loginPageLayout || "split";
  // Important: initial render must be deterministic to avoid hydration mismatch.
  const [quote, setQuote] = React.useState(() => getQuoteForGallery(galleryId));
  
  // Get container ref to measure dimensions
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = React.useState({ width: 0, height: 0 });

  // Measure container dimensions
  React.useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      updateDimensions();
    });
    
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isResolved, layout]);

  // Calculate cover area dimensions based on layout (same as preview)
  const getCoverAreaDimensions = React.useCallback(() => {
    const { width, height } = containerDimensions;
    if (width === 0 || height === 0) {
      return { width: 0, height: 0 };
    }
    
    switch (layout) {
      case "split":
        return { width: width * 0.64, height: height };
      case "angled-split":
        return { width: width, height: height };
      case "centered":
      case "full-cover":
        return { width: width, height: height };
      default:
        return { width: width * 0.55, height: height };
    }
  }, [layout, containerDimensions]);

  const coverAreaDims = getCoverAreaDimensions();

  // Convert objectPosition to container coordinates (invert both X and Y)
  const containerPosition = React.useMemo(() => {
    if (!coverPhotoPosition?.objectPosition || coverAreaDims.width === 0 || coverAreaDims.height === 0) {
      // Default to center
      return {
        x: coverAreaDims.width / 2,
        y: coverAreaDims.height / 2,
        scale: coverPhotoPosition?.scale || 1,
      };
    }

    const match = coverPhotoPosition.objectPosition.match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
    if (!match) {
      return {
        x: coverAreaDims.width / 2,
        y: coverAreaDims.height / 2,
        scale: coverPhotoPosition?.scale || 1,
      };
    }

    // Invert both X and Y: objectPosition maps to container coordinates
    const objectX = parseFloat(match[1]);
    const objectY = parseFloat(match[2]);
    const containerXPercent = 100 - objectX;
    const containerYPercent = 100 - objectY;

    // Convert percentages to pixels
    const x = (containerXPercent / 100) * coverAreaDims.width;
    const y = (containerYPercent / 100) * coverAreaDims.height;

    return {
      x,
      y,
      scale: coverPhotoPosition?.scale || 1,
    };
  }, [coverPhotoPosition, coverAreaDims]);

  React.useEffect(() => {
    // Rotate after mount (client-only). This avoids server/client text mismatch on hydration.
    setQuote(getRotatingQuoteForGallery(galleryId));
  }, [galleryId]);

  return (
    <section className="relative w-full h-full min-h-[320px] md:min-h-screen overflow-hidden bg-gray-50">
      {/* Hidden div to measure container dimensions */}
      <div ref={containerRef} className="absolute inset-0 pointer-events-none opacity-0" aria-hidden="true" />
      {/* Workflow: start with loader → then render cover OR fallback once resolved */}
      {isResolved ? (
        coverPhotoUrl ? (
          <div className="absolute inset-0 overflow-hidden">
            {/* Cover area - same dimensions as preview */}
            {coverAreaDims.width > 0 && coverAreaDims.height > 0 ? (
              <div
                className="absolute inset-0 z-0"
                style={{
                  width: coverAreaDims.width,
                  height: coverAreaDims.height,
                }}
              >
                {/* Image container - positioned like preview */}
                <div
                  className="absolute"
                  style={{
                    left: containerPosition.x,
                    top: containerPosition.y,
                    transform: `translate(-50%, -50%) scale(${containerPosition.scale})`,
                    width: coverAreaDims.width,
                    height: coverAreaDims.height,
                    transformOrigin: 'center center',
                    zIndex: layout === "angled-split" ? 0 : layout === "full-cover" || layout === "centered" ? 5 : 10,
                  }}
                  key={`cover-container-${coverPhotoPosition?.objectPosition || 'default'}-${containerPosition.scale}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverPhotoUrl}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none"
                    style={{
                      objectPosition: "50% 50%", // Keep centered - we move the container, not the image content
                    }}
                    loading="eager"
                  />
                </div>
              </div>
            ) : (
              // Fallback while dimensions are being calculated
              <div className="absolute inset-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverPhotoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ objectPosition: '50% 50%' }}
                  loading="eager"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full max-w-xl px-10 text-center">
              <PhotoCloudMark variant="full" className="mx-auto" />

              {quote ? (
                <figure className="mt-10 mx-auto max-w-lg">
                  <blockquote className="relative text-base md:text-lg text-gray-700/60 leading-relaxed italic">
                    <span className="absolute -left-3 -top-6 text-6xl text-gray-900/35 select-none">“</span>
                    {quote.text}
                  </blockquote>
                  <figcaption className="mt-4 text-sm text-gray-700/55 text-right">
                    — {quote.author}
                  </figcaption>
                  {quote.work ? (
                    <div className="mt-1 text-xs text-gray-600/45 text-right">
                      {quote.work}
                    </div>
                  ) : null}
                </figure>
              ) : (
                <div className="mt-8 text-sm text-gray-600">
                  Profesjonalne galerie dla fotografów.
                </div>
              )}
            </div>
          </div>
        )
      ) : null}

      {/* Loader overlay: cover pane only, never blocks the login form */}
      {isLoading && <CoverAreaLoading />}
    </section>
  );
});

