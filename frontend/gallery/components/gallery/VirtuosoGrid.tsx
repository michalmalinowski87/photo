"use client";

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import justifiedLayout from "justified-layout";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import type { ImageData } from "@/types/gallery";
import { EmptyState } from "./EmptyState";

export type GridLayout = "square" | "standard" | "marble" | "carousel";

interface VirtuosoGridProps {
  images: ImageData[];
  layout: GridLayout;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  isFetchingNextPage?: boolean;
  galleryId?: string;
  selectedKeys?: Set<string>;
  onImageSelect?: (key: string) => void;
  canSelect?: boolean;
  showSelectionIndicators?: boolean;
  showUnselectedIndicators?: boolean;
  enableDownload?: boolean;
  onDownload?: (imageKey: string) => void;
}

interface LayoutBox {
  aspectRatio: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

export function VirtuosoGridComponent({
  images,
  layout,
  hasNextPage,
  onLoadMore,
  isFetchingNextPage,
  selectedKeys = new Set(),
  onImageSelect,
  canSelect = false,
  showSelectionIndicators = false,
  showUnselectedIndicators = true,
  enableDownload = false,
  onDownload,
}: VirtuosoGridProps) {
  const [containerWidth, setContainerWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  // Store measured dimensions for images that didn't come with width/height from the API.
  // This helps preserve original portrait/landscape ratios, especially for small sets.
  const [imageDimensions, setImageDimensions] = useState<
    Map<string, { width: number; height: number }>
  >(new Map());

  // Update container width on resize and when images change - use full available width for edge-to-edge
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        // Use full container width (parent already handles padding)
        // Ensure width doesn't exceed viewport
        const maxWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const width = Math.min(
          containerRef.current.clientWidth || maxWidth,
          maxWidth
        );
        setContainerWidth(width);
      }
    };

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateWidth, 0);
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener("resize", updateWidth);
    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [images.length, images]); // Recalculate when images change (e.g., switching views) - include images array to detect reference changes

  // Calculate layout boxes - justified for square/standard, masonry for marble
  const layoutBoxes = useMemo(() => {
    if (images.length === 0) return [];

    const boxSpacing = 7; // Very tight spacing (2x smaller than before) for edge-to-edge fill
    const effectiveWidth = Math.max(containerWidth, 300); // Use full width (padding handled by parent)

    // For marble (masonry), use column-based masonry layout
    if (layout === "marble") {
      // Calculate responsive number of columns
      const maxColumns = effectiveWidth < 640 ? 2 : effectiveWidth < 1024 ? 3 : 4;

      // When there are too few photos to form multiple masonry rows, a single-row masonry layout
      // tends to look "random" (varying heights across a single line). In that case, fall back
      // to a single-row "fit to width" layout:
      // - uses true aspect ratios (portrait/landscape)
      // - fills the full available width without cropping
      if (images.length <= maxColumns) {
        const aspectRatios = images.map((image, index) => {
          const extractedDims = imageDimensions.get(image.key);
          const width = image.width ?? extractedDims?.width;
          const height = image.height ?? extractedDims?.height;
          if (width && height && width > 0 && height > 0) {
            return width / height;
          }
          // Sensible fallback ratio if we don't know dimensions yet.
          // (Most photos are closer to 4:3 / 3:2 than 1:1.)
          return index % 3 === 0 ? 1.5 : 1.3333;
        });

        const rowWidthWithoutSpacing =
          effectiveWidth - (images.length - 1) * boxSpacing;
        const sumAspectRatios = aspectRatios.reduce((sum, ar) => sum + ar, 0);
        const rowHeight =
          sumAspectRatios > 0 ? rowWidthWithoutSpacing / sumAspectRatios : 200;

        let left = 0;
        const boxes: LayoutBox[] = aspectRatios.map((aspectRatio) => {
          const width = aspectRatio * rowHeight;
          const box: LayoutBox = {
            aspectRatio,
            top: 0,
            left,
            width,
            height: rowHeight,
          };
          left += width + boxSpacing;
          return box;
        });

        return boxes;
      }

      const numColumns = maxColumns;
      const columnWidth = Math.floor((effectiveWidth - (numColumns - 1) * boxSpacing) / numColumns);
      const columnHeights = new Array(numColumns).fill(0);
      const boxes: LayoutBox[] = [];

      images.forEach((image, index) => {
        // Calculate item dimensions based on actual image dimensions or estimate
        let itemHeight: number;

        const extractedDims = imageDimensions.get(image.key);
        const width = image.width ?? extractedDims?.width;
        const height = image.height ?? extractedDims?.height;

        if (width && height && width > 0 && height > 0) {
          // Use actual aspect ratio to calculate height
          const aspectRatio = width / height;
          itemHeight = columnWidth / aspectRatio;
        } else {
          // Estimate based on index for variety (alternating between portrait and landscape)
          // This creates natural variation in masonry layout
          const isPortrait = index % 3 !== 0; // Roughly 2/3 portrait, 1/3 landscape
          itemHeight = isPortrait 
            ? columnWidth * 1.4  // Portrait: taller
            : columnWidth * 0.75; // Landscape: shorter
        }

        // Find the shortest column (true masonry algorithm)
        let shortestColumnIndex = 0;
        let shortestHeight = columnHeights[0];
        for (let i = 1; i < numColumns; i++) {
          if (columnHeights[i] < shortestHeight) {
            shortestHeight = columnHeights[i];
            shortestColumnIndex = i;
          }
        }
        
        // Calculate position - ensure it doesn't exceed container width
        const left = Math.min(
          shortestColumnIndex * (columnWidth + boxSpacing),
          effectiveWidth - columnWidth
        );
        const top = columnHeights[shortestColumnIndex];
        
        boxes.push({
          aspectRatio: columnWidth / itemHeight,
          top,
          left: Math.max(0, left), // Ensure left is never negative
          width: Math.min(columnWidth, effectiveWidth - left), // Ensure width doesn't exceed container
          height: itemHeight,
        });

        // Update column height for next item
        columnHeights[shortestColumnIndex] = top + itemHeight + boxSpacing;
      });

      return boxes;
    }

    // For square and standard, use justified layout
    const targetRowHeight = layout === "square" ? 200 : 200;
    
    // Get image dimensions - use actual dimensions if available, or estimate
    const items = images.map((image) => {
      // Use actual dimensions if available
      if (image.width && image.height) {
        return { width: image.width, height: image.height };
      }
      // For square layout, force 1:1 aspect ratio
      if (layout === "square") {
        return { width: 300, height: 300 };
      }
      // For standard layout, use 4:3 aspect ratio
      return { width: 400, height: 300 };
    });

    const justified = justifiedLayout(items, {
      containerWidth: effectiveWidth,
      targetRowHeight,
      boxSpacing,
      containerPadding: 0,
    });

    return justified.boxes as LayoutBox[];
  }, [images, layout, containerWidth, imageDimensions]);

  // Calculate total height for the container
  // Use max bottom to handle masonry columns reliably.
  // Account for container padding (top: 8px, bottom: 8px) and extra space for ring borders.
  const containerHeight = useMemo(() => {
    if (layoutBoxes.length === 0) return 0;
    let maxBottom = 0;
    for (const box of layoutBoxes) {
      maxBottom = Math.max(maxBottom, box.top + box.height);
    }
    // Container padding-top (8px) + max content bottom + bottom padding (8px) + ring space (4px)
    return 8 + maxBottom + 8 + 4;
  }, [layoutBoxes]);

  // Infinite scroll using Intersection Observer
  useEffect(() => {
    // Only set up observer if we have more pages and aren't currently fetching
    if (!hasNextPage || !onLoadMore || isFetchingNextPage) {
      // Unobserve if we're done loading
      if (observerTarget.current) {
        const observer = new IntersectionObserver(() => {});
        observer.unobserve(observerTarget.current);
      }
      return;
    }

    let isLoading = false; // Guard to prevent multiple simultaneous loads

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && onLoadMore && !isFetchingNextPage && !isLoading) {
          isLoading = true;
          onLoadMore();
          // Reset guard after a short delay
          setTimeout(() => {
            isLoading = false;
          }, 1000);
        }
      },
      { threshold: 0, rootMargin: "3000px" } // Very aggressive prefetching - start loading 3000px before reaching the end (threshold 0 = trigger as soon as any part is visible)
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, onLoadMore, isFetchingNextPage]);

  if (images.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={64} />}
        title="Brak zdjęć"
        description="W tej galerii nie ma jeszcze żadnych zdjęć."
      />
    );
  }

  return (
    <div ref={containerRef} className="w-full bg-white overflow-hidden">
      <div style={{ position: "relative", height: containerHeight, width: "100%", maxWidth: "100%", paddingTop: "8px", paddingBottom: "8px" }} className="bg-white overflow-hidden">
        {images.map((image, index) => {
          const box = layoutBoxes[index];
          if (!box) return null;

          const imageUrl = image.bigThumbUrl || image.thumbnailUrl || image.url;
          const previewUrl = image.previewUrl || image.url;
          const fullImageUrl = image.url;
          const carouselThumbUrl = image.thumbnailUrl || (image as any).thumbUrl || image.bigThumbUrl || image.url;

          const marbleMaxColumns =
            containerWidth < 640 ? 2 : containerWidth < 1024 ? 3 : 4;
          const isSingleRowMarble = layout === "marble" && images.length <= marbleMaxColumns;

          const imageClasses =
            layout === "square"
              ? "object-cover rounded-[2px]"
              : layout === "standard"
              ? "object-contain rounded-[2px]"
              : isSingleRowMarble
              ? "object-contain rounded-[2px]"
              : "object-cover rounded-[2px]";

          const isSelected = selectedKeys.has(image.key);
          // Show indicator when:
          // - showSelectionIndicators is true AND
          // - (image is selected OR showUnselectedIndicators is true)
          const showIndicator = showSelectionIndicators && (isSelected || showUnselectedIndicators);

          return (
            <div
              key={`${image.key || image.url || 'image'}-${index}`}
              style={{
                position: "absolute",
                top: box.top + 8, // Container padding-top provides the spacing
                left: box.left,
                width: box.width,
                height: box.height,
                boxSizing: "border-box", // Ensure ring border is included in dimensions
              }}
              className={`overflow-hidden bg-white rounded-[2px] cursor-pointer transition-all duration-200 ease-out shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:scale-[1.0085] hover:-translate-y-[0.85px] hover:shadow-[0_6px_26px_rgba(0,0,0,0.13)] active:scale-100 active:translate-y-0 active:shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${
                isSelected ? "ring-2 ring-black ring-opacity-70" : ""
              }`}
            >
              <a
                href={fullImageUrl}
                data-src={previewUrl}
                data-download-url={enableDownload ? fullImageUrl : undefined}
                data-thumb={carouselThumbUrl}
                data-sub-html={image.key}
                className="block w-full h-full relative"
                onClick={(e) => {
                  // If selection is enabled and user clicks the selection indicator area, prevent lightGallery
                  if (canSelect && onImageSelect && (e.target as HTMLElement).closest('.selection-indicator')) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                <Image
                  src={imageUrl}
                  alt={image.alt || `Image ${index + 1}`}
                  fill
                  className={imageClasses}
                  onLoadingComplete={(img) => {
                    // Capture natural dimensions for better aspect ratio layout when API didn't provide them.
                    if (layout !== "marble") return;
                    const w = img.naturalWidth;
                    const h = img.naturalHeight;
                    if (!(w > 0 && h > 0)) return;
                    const key = image.key;
                    setImageDimensions((prev) => {
                      if (prev.has(key)) return prev;
                      const next = new Map(prev);
                      next.set(key, { width: w, height: h });
                      return next;
                    });
                  }}
                  priority={index < 3} // Prioritize first 3 images for LCP
                  loading={index < 3 ? undefined : "lazy"}
                  unoptimized={imageUrl.startsWith("http")}
                />
              </a>
              
              {/* Selection indicator */}
              {showIndicator && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onImageSelect) {
                onImageSelect(image.key);
              }
            }}
                  className={`selection-indicator absolute top-2 right-2 w-11 h-11 rounded-full flex items-center justify-center transition-all touch-manipulation z-10 ${
                    isSelected
                      ? "bg-black text-white"
                      : "bg-white/80 text-gray-700 hover:bg-white/95 border-0"
                  }`}
                  aria-label={isSelected ? "Odznacz zdjęcie" : "Zaznacz zdjęcie"}
                  style={{
                    minWidth: "44px",
                    minHeight: "44px",
                  }}
                >
                  {isSelected ? (
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  )}
                </button>
              )}

              {/* Download button - only show in delivered view */}
              {enableDownload && onDownload && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onDownload) {
                      onDownload(image.key);
                    }
                  }}
                  className="absolute top-2 right-2 w-11 h-11 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-all touch-manipulation z-10 shadow-md hover:shadow-lg"
                  aria-label="Pobierz zdjęcie"
                  style={{
                    minWidth: "44px",
                    minHeight: "44px",
                  }}
                >
                  <svg
                    className="w-5 h-5 text-gray-800"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
      {/* Observer target for infinite scroll - only show if there are more pages */}
      {hasNextPage && <div ref={observerTarget} className="h-4" />}
      {isFetchingNextPage && (
        <div className="text-center py-8 text-gray-400 bg-white">
          Loading more images...
        </div>
      )}
    </div>
  );
}
