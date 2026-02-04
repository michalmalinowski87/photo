"use client";

import React, { memo } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import { CoverAreaLoading } from "@/components/ui/CoverAreaLoading";
import { PixiProofMark } from "@/components/branding/PixiProofMark";
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
  onGalleryRemoved?: () => void;
  loginPageLayout?: string | null;
}

export const LoginCoverPane = memo(function LoginCoverPane({
  galleryId,
  apiUrl,
  onPublicInfoLoaded,
  onPublicInfoLoadingChange,
  onGalleryRemoved,
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
      } catch (err) {
        const status = (err as ApiError).status;
        if (status === 404) {
          onGalleryRemoved?.();
        }
        // If we can't load public info (and it's not 404), assume no cover and show PixiProof fallback.
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
  }, [galleryId, apiUrl, onPublicInfoLoaded, onPublicInfoLoadingChange, onGalleryRemoved]);

  const coverPhotoUrl = publicInfo?.coverPhotoUrl || null;
  const coverPhotoPosition = publicInfo?.coverPhotoPosition;
  const isResolved = publicInfo !== null;
  const layout = loginPageLayout || publicInfo?.loginPageLayout || "split";
  // Important: initial render must be deterministic to avoid hydration mismatch.
  const [quote, setQuote] = React.useState(() => getQuoteForGallery(galleryId));
  
  // Get container ref to measure dimensions
  // For consistent positioning, we need to measure the full page container, not just the cover pane
  // In layout 1 (split), the cover pane is only 64% width, but we want to use full page dimensions
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = React.useState({ width: 0, height: 0 });

  // Measure full page container dimensions (not just cover pane)
  // This ensures same position accuracy across all layouts
  // For layout 1 (split), we need to measure the parent flex container, not just the cover pane
  React.useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const section = containerRef.current;
        
        // For layout 1 (split), the cover pane is inside a flex container
        // We need to measure the parent container that has both cover and form panes
        if (layout === "split") {
          // Find the parent container (the one with flex and min-h-screen classes)
          let parent = section.parentElement; // coverPane div
          if (parent) {
            parent = parent.parentElement; // container div with flex
            if (parent) {
              const rect = parent.getBoundingClientRect();
              setContainerDimensions({
                width: rect.width,
                height: rect.height,
              });
              return;
            }
          }
        }
        
        // For other layouts, the section itself represents the full container
        // (it's positioned absolute inset-0, so it's the full page)
        setContainerDimensions({
          width: section.clientWidth,
          height: section.clientHeight,
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
  // For layout 1 (split), make it work like layout 2 (angled-split) - full width
  const getCoverAreaDimensions = React.useCallback(() => {
    const { width, height } = containerDimensions;
    if (width === 0 || height === 0) {
      return { width: 0, height: 0 };
    }
    
    switch (layout) {
      case "split":
        // Make layout 1 work like layout 2 - full width cover area
        return { width: width, height: height };
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

  // Convert position to container top-left corner coordinates
  // Use x, y percentages directly (same coordinate system as Personalizacja)
  const containerPosition = React.useMemo(() => {
    const scale = coverPhotoPosition?.scale || 1;
    
    if (containerDimensions.width === 0 || containerDimensions.height === 0) {
      // Default to top-left (0, 0)
      return {
        x: 0,
        y: 0,
        scale,
      };
    }

    // Use x, y directly if available (new format - same as Personalizacja)
    if (coverPhotoPosition?.x !== undefined && coverPhotoPosition?.y !== undefined) {
      // Convert percentages to pixels (top-left corner position)
      // Position is always relative to the full container dimensions (same as Personalizacja)
      // In Personalizacja: position is calculated from full container width, applied within cover area
      // In live preview: position should also be calculated from full page width, applied within section
      // The cover area/section is just a clipping viewport - the position coordinate system is the same
      const x = (coverPhotoPosition.x / 100) * containerDimensions.width;
      const y = (coverPhotoPosition.y / 100) * containerDimensions.height;
      return { x, y, scale };
    }

    // Legacy support: convert from objectPosition
    if (coverPhotoPosition?.objectPosition) {
      const match = coverPhotoPosition.objectPosition.match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        // Invert both X and Y: objectPosition was inverted
        const objectX = parseFloat(match[1]);
        const objectY = parseFloat(match[2]);
        const containerXPercent = 100 - objectX;
        const containerYPercent = 100 - objectY;
        const x = (containerXPercent / 100) * containerDimensions.width;
        const y = (containerYPercent / 100) * containerDimensions.height;
        return { x, y, scale };
      }
    }

    // Default to top-left (0, 0)
    return {
      x: 0,
      y: 0,
      scale,
    };
  }, [coverPhotoPosition, containerDimensions, layout]);

  React.useEffect(() => {
    // Rotate after mount (client-only). This avoids server/client text mismatch on hydration.
    setQuote(getRotatingQuoteForGallery(galleryId));
  }, [galleryId]);

  return (
    <section className="relative w-full h-full min-h-[320px] md:min-h-screen overflow-hidden bg-gray-50">
      {/* Hidden div to measure full page container dimensions (for consistent positioning) */}
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
                  // For all layouts, use explicit dimensions calculated from full page container
                  // Position is calculated from full page width, cover area matches that
                  width: coverAreaDims.width,
                  height: coverAreaDims.height,
                }}
              >
                {/* Image container - positioned like preview (top-left corner) */}
                <div
                  className="absolute"
                  style={{
                    left: containerPosition.x,
                    top: containerPosition.y,
                    transform: `scale(${containerPosition.scale})`,
                    // Image container width matches cover area dimensions (same as Personalizacja)
                    // Position is calculated from full container, width matches cover area
                    width: coverAreaDims.width,
                    height: coverAreaDims.height,
                    transformOrigin: 'top left',
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
          <div className="absolute inset-0 flex items-center">
            <div className="w-full max-w-xl px-10 text-center">
              <PixiProofMark variant="full" className="mx-auto" showSlogan={true} />

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

