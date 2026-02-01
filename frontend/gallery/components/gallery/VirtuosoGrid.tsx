"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import justifiedLayout from "justified-layout";
import Image from "next/image";
import { Sparkles, BookOpen, BookOpenCheck, Image as ImageIcon, ImagePlus } from "lucide-react";
import type { ImageData } from "@/types/gallery";
import { EmptyState } from "./EmptyState";
import { LazyRetryableImage } from "../ui/LazyRetryableImage";
import { ThreeDotsIndicator } from "../ui/Loading";


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
  hideBorders?: boolean;
  showPhotoBookUi?: boolean;
  showPhotoPrintUi?: boolean;
  photoBookKeys?: string[];
  photoPrintKeys?: string[];
  photoBookCount?: number;
  photoPrintCount?: number;
  onTogglePhotoBook?: (key: string) => void;
  onTogglePhotoPrint?: (key: string) => void;
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
  galleryId,
  selectedKeys = new Set(),
  onImageSelect,
  canSelect = false,
  showSelectionIndicators = false,
  showUnselectedIndicators = true,
  enableDownload = false,
  onDownload,
  hideBorders = false,
  showPhotoBookUi = false,
  showPhotoPrintUi = false,
  photoBookKeys = [],
  photoPrintKeys = [],
  photoBookCount = 0,
  photoPrintCount = 0,
  onTogglePhotoBook,
  onTogglePhotoPrint,
}: VirtuosoGridProps) {
  const [containerWidth, setContainerWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const lastContainerWidthRef = useRef(1200);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const WIDTH_SNAP_PX = 50; // Snap width so scrollbar (~17px) doesn't change snapped value → no mid-scroll reshuffle
  const RESIZE_DEBOUNCE_MS = 150;

  // No dimension extraction for any layout - we use fixed/estimated boxes only.
  // This prevents reshuffle when images load or on scroll (layout only depends on images.length, layout, containerWidth).

  // Update container width on resize and when images change - use full available width for edge-to-edge.
  // Snap width to WIDTH_SNAP_PX so scrollbar appearing/disappearing (e.g. 1200→1183) keeps same snapped value (1200) → no reshuffle.
  useEffect(() => {
    const applyWidth = (rawWidth: number) => {
      const snapped = Math.round(rawWidth / WIDTH_SNAP_PX) * WIDTH_SNAP_PX;
      const prev = lastContainerWidthRef.current;
      if (snapped === prev) return;
      lastContainerWidthRef.current = snapped;
      setContainerWidth(snapped);
    };

    const doUpdate = () => {
      if (!containerRef.current) return;
      const maxWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
      const width = Math.min(containerRef.current.clientWidth || maxWidth, maxWidth);
      applyWidth(width);
    };

    const scheduleUpdate = () => {
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(doUpdate, RESIZE_DEBOUNCE_MS);
    };

    // Initial measure (no debounce so first paint is correct)
    const timeoutId = setTimeout(doUpdate, 0);
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      clearTimeout(timeoutId);
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [images.length, images]); // Recalculate when images change (e.g., switching views) - include images array to detect reference changes

  // Calculate layout boxes - justified for square/standard, masonry for marble.
  // Depend only on images.length (not images ref) so parent re-renders with new array reference don't trigger recalc/reshuffle.
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
        // Use estimates only - never real dimensions. Grid size is fixed; images fit inside with object-fit (no reshuffle).
        const aspectRatios = images.map((_, index) =>
          index % 3 === 0 ? 1.5 : 1.3333
        );

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

        // Apply 400px max constraint on longer edge for 1-3 photos
        if (images.length <= 3) {
          const maxLongerEdge = 400;
          let maxDimension = 0;
          boxes.forEach((box) => {
            const longerEdge = Math.max(box.width, box.height);
            maxDimension = Math.max(maxDimension, longerEdge);
          });

          // If any box exceeds the max, scale down proportionally
          if (maxDimension > maxLongerEdge) {
            const scaleFactor = maxLongerEdge / maxDimension;
            let scaledLeft = 0;
            return boxes.map((box) => {
              const scaledWidth = box.width * scaleFactor;
              const scaledHeight = box.height * scaleFactor;
              const scaledBox: LayoutBox = {
                aspectRatio: box.aspectRatio,
                top: box.top,
                left: scaledLeft,
                width: scaledWidth,
                height: scaledHeight,
              };
              scaledLeft += scaledWidth + boxSpacing;
              return scaledBox;
            });
          }
        }

        return boxes;
      }

      const numColumns = maxColumns;
      const columnWidth = Math.floor((effectiveWidth - (numColumns - 1) * boxSpacing) / numColumns);
      const columnHeights = new Array(numColumns).fill(0);
      const boxes: LayoutBox[] = [];

      // Use estimates only for marble - never real dimensions. Box sizes are fixed from first render;
      // images render inside with object-fit so no reshuffle when lazy-loaded image has different aspect ratio.
      images.forEach((image, index) => {
        let itemHeight: number;
        const isPortrait = index % 3 !== 0; // Roughly 2/3 portrait, 1/3 landscape
        itemHeight = isPortrait
          ? columnWidth * 1.4   // Portrait: taller
          : columnWidth * 0.75; // Landscape: shorter

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

    // For square and standard, use justified layout with fixed box sizes only (no real dimensions).
    // This keeps layout stable and prevents reshuffle when images load or on scroll.
    const targetRowHeight = layout === "square" ? 200 : 200;
    const items = images.map(() =>
      layout === "square"
        ? { width: 300, height: 300 }
        : { width: 400, height: 300 }
    );

    const justified = justifiedLayout(items, {
      containerWidth: effectiveWidth,
      targetRowHeight,
      boxSpacing,
      containerPadding: 0,
    });

    return justified.boxes as LayoutBox[];
  }, [images.length, layout, containerWidth]); // images.length only (not images ref) to avoid recalc on parent re-renders

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
      { threshold: 0, rootMargin: "5000px" } // Prefetch when sentinel is ~5 viewport heights from bottom
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
    <div
      ref={containerRef}
      className={`w-full overflow-hidden ${hideBorders ? "bg-transparent" : "bg-white"}`}
    >
      <div
        style={{
          position: "relative",
          height: containerHeight,
          width: "100%",
          maxWidth: "100%",
          paddingTop: "8px",
          paddingBottom: "8px",
        }}
        className={`overflow-hidden ${hideBorders ? "bg-transparent" : "bg-white"}`}
      >
        {images.map((image, index) => {
          const box = layoutBoxes[index];
          if (!box) return null;

          const imageUrl = image.bigThumbUrl || image.thumbnailUrl || image.url;
          const previewUrl = image.previewUrl || image.url;
          // Best available; original never exposed in gallery app
          const fullImageUrl =
            image.url ?? image.previewUrl ?? image.bigThumbUrl ?? image.thumbnailUrl;
          // Carousel bottom thumbnails: thumb (CloudFront) → bigthumb (CloudFront) → preview (CloudFront)
          // S3 presigned URLs fetched on-demand per image if CloudFront fails
          const carouselThumbUrl =
            image.thumbnailUrl || (image as any).thumbUrl || image.bigThumbUrl || image.previewUrl || image.url;

          const marbleMaxColumns = containerWidth < 640 ? 2 : containerWidth < 1024 ? 3 : 4;
          const isSingleRowMarble = layout === "marble" && images.length <= marbleMaxColumns;

          const imageClasses = hideBorders
            ? layout === "square"
              ? "object-cover"
              : layout === "standard"
                ? "object-contain"
                : isSingleRowMarble
                  ? "object-contain"
                  : "object-cover"
            : layout === "square"
              ? "object-cover rounded-[2px]"
              : layout === "standard"
                ? "object-contain rounded-[2px]"
                : isSingleRowMarble
                  ? "object-contain rounded-[2px]"
                  : "object-cover rounded-[2px]";

          const isSelected = selectedKeys.has(image.key);
          const showIndicator = showSelectionIndicators && (isSelected || showUnselectedIndicators);
          const inBook = !!(showPhotoBookUi && photoBookKeys.includes(image.key));
          const inPrint = !!(showPhotoPrintUi && photoPrintKeys.includes(image.key));
          const canAddToBook = showPhotoBookUi && (inBook || photoBookKeys.length < photoBookCount);
          const canAddToPrint =
            showPhotoPrintUi && (inPrint || photoPrintKeys.length < photoPrintCount);
          const showBookPrint =
            isSelected &&
            (canAddToBook || canAddToPrint) &&
            (onTogglePhotoBook || onTogglePhotoPrint);

          return (
            <div
              key={`${image.key || image.url || "image"}-${index}`}
              data-image-key={image.key}
              style={{
                position: "absolute",
                top: box.top + 8, // Container padding-top provides the spacing
                left: box.left,
                width: box.width,
                height: box.height,
                boxSizing: "border-box", // Ensure ring border is included in dimensions
              }}
              className={`overflow-visible cursor-pointer transition-all duration-200 ease-out ${
                hideBorders
                  ? "bg-transparent hover:scale-[1.0085] hover:-translate-y-[0.85px] active:scale-100 active:translate-y-0"
                  : "bg-white rounded-[2px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:scale-[1.0085] hover:-translate-y-[0.85px] hover:shadow-[0_6px_26px_rgba(0,0,0,0.13)] active:scale-100 active:translate-y-0 active:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              } ${isSelected && !hideBorders ? "ring-2 ring-black ring-opacity-70" : ""}`}
            >
              <a
                href={fullImageUrl}
                data-src={previewUrl}
                data-download-url={enableDownload ? fullImageUrl : undefined}
                data-thumb={carouselThumbUrl}
                data-sub-html={image.key}
                className="block w-full h-full relative overflow-hidden rounded-[2px]"
                onClick={(e) => {
                  // Prevent default anchor behavior until lightGallery is ready (prevents race condition)
                  // Check if lightGallery container exists and is ready by looking for the data attribute
                  // Try multiple ways to find the container in case DOM structure varies
                  let container: HTMLElement | null = (e.target as HTMLElement).closest(
                    "[data-lg-container]"
                  ) as HTMLElement;
                  if (!container) {
                    // Fallback: find any parent with the attribute
                    let element: HTMLElement | null = e.target as HTMLElement;
                    while (element && element !== document.body) {
                      if (element.hasAttribute("data-lg-container")) {
                        container = element;
                        break;
                      }
                      element = element.parentElement;
                    }
                  }
                  const isGalleryReady = container?.getAttribute("data-lg-ready") === "true";
                  // Only prevent if we found the container and it's explicitly not ready
                  // If container not found, assume gallery is ready (fallback for edge cases)
                  if (container && !isGalleryReady) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }

                  // If selection is enabled and user clicks the selection indicator area, prevent lightGallery
                  if (
                    canSelect &&
                    onImageSelect &&
                    (e.target as HTMLElement).closest(".selection-indicator")
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                <LazyRetryableImage
                  image={image}
                  alt={image.alt || `Image ${index + 1}`}
                  fill
                  className={imageClasses}
                  preferredSize="bigthumb"
                  galleryId={galleryId}
                  priority={index < 3} // Prioritize first 3 images for LCP
                  rootMargin="300px" // Prefetch images 300px before they become visible
                />
              </a>

              {/* Selection indicator and optional photo book/print */}
              {showIndicator && (
                <div className="selection-indicator absolute top-2 right-2 flex flex-row gap-1 items-center z-10">
                  {showBookPrint && (
                    <>
                      {canAddToBook && onTogglePhotoBook && (
                        <span className="relative group">
                          <span
                            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs whitespace-nowrap bg-gray-900 dark:bg-gray-700 text-white rounded opacity-0 group-hover:opacity-100 transition-none pointer-events-none z-20"
                            style={{ transitionDelay: "0ms" }}
                          >
                            {inBook ? "Usuń z albumu" : "Dodaj do albumu"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onTogglePhotoBook(image.key);
                            }}
                            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all touch-manipulation shadow border-0 ${
                              inBook
                                ? "bg-black text-white"
                                : "bg-white/80 text-gray-700 hover:bg-white/95 dark:bg-gray-800/90 dark:text-gray-300"
                            }`}
                            aria-label={inBook ? "Usuń z albumu" : "Dodaj do albumu"}
                            style={{ minWidth: "44px", minHeight: "44px" }}
                          >
                            {inBook ? (
                              <BookOpenCheck className="w-6 h-6" strokeWidth={2} />
                            ) : (
                              <BookOpen className="w-6 h-6" strokeWidth={2} />
                            )}
                          </button>
                        </span>
                      )}
                      {canAddToPrint && onTogglePhotoPrint && (
                        <span className="relative group">
                          <span
                            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs whitespace-nowrap bg-gray-900 dark:bg-gray-700 text-white rounded opacity-0 group-hover:opacity-100 transition-none pointer-events-none z-20"
                            style={{ transitionDelay: "0ms" }}
                          >
                            {inPrint ? "Usuń z druku" : "Dodaj do druku"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onTogglePhotoPrint(image.key);
                            }}
                            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all touch-manipulation shadow border-0 ${
                              inPrint
                                ? "bg-black text-white"
                                : "bg-white/80 text-gray-700 hover:bg-white/95 dark:bg-gray-800/90 dark:text-gray-300"
                            }`}
                            aria-label={inPrint ? "Usuń z druku" : "Dodaj do druku"}
                            style={{ minWidth: "44px", minHeight: "44px" }}
                          >
                            {inPrint ? (
                              <ImageIcon className="w-6 h-6" strokeWidth={2} />
                            ) : (
                              <ImagePlus className="w-6 h-6" strokeWidth={2} />
                            )}
                          </button>
                        </span>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (onImageSelect) onImageSelect(image.key);
                    }}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all touch-manipulation ${
                      isSelected
                        ? "bg-black text-white"
                        : "bg-white/80 text-gray-700 hover:bg-white/95 dark:bg-gray-800/90 dark:text-gray-300 border-0"
                    }`}
                    aria-label={isSelected ? "Odznacz zdjęcie" : "Zaznacz zdjęcie"}
                    style={{ minWidth: "44px", minHeight: "44px" }}
                  >
                    {isSelected ? (
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </button>
                </div>
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
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <ThreeDotsIndicator />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Ładowanie zdjęć...
          </p>
        </div>
      )}
    </div>
  );
}
