"use client";

import justifiedLayout from "justified-layout";
import { Sparkles } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";

import type { GalleryImage } from "../../types";
import { EmptyState } from "../ui/empty-state/EmptyState";
import { Loading } from "../ui/loading/Loading";

import type { GridLayout } from "./LayoutSelector";

interface LayoutBox {
  aspectRatio: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DashboardVirtuosoGridProps {
  images: GalleryImage[];
  layout: GridLayout;
  renderImageItem: (img: GalleryImage, index: number, allImages: GalleryImage[]) => React.ReactNode;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  error?: unknown;
  className?: string;
}

export function DashboardVirtuosoGrid({
  images,
  layout,
  renderImageItem,
  hasNextPage = false,
  onLoadMore,
  isFetchingNextPage = false,
  isLoading = false,
  error: _error,
  className = "",
}: DashboardVirtuosoGridProps) {
  const [containerWidth, setContainerWidth] = useState(1200);
  const [imageDimensions, setImageDimensions] = useState<
    Map<string, { width: number; height: number }>
  >(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<Map<string, HTMLImageElement>>(new Map());

  // Update container width on resize and when images change
  // Use actual container width (not window width) to account for sidebar
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        // Use getBoundingClientRect for accurate width measurement
        // This accounts for any padding, borders, and scrollbars correctly
        const rect = containerRef.current.getBoundingClientRect();
        const width = rect.width || containerRef.current.clientWidth || 1200;
        // Ensure we have a valid width (at least 300px for mobile)
        const validWidth = Math.max(width, 300);
        // Only update if width actually changed to avoid unnecessary re-renders
        setContainerWidth((prev) => {
          // Use a small threshold to avoid constant updates from minor floating point differences
          if (Math.abs(prev - validWidth) > 1) {
            return validWidth;
          }
          return prev;
        });
      }
    };

    // Initial update with requestAnimationFrame to ensure DOM is fully laid out
    const rafId = requestAnimationFrame(updateWidth);
    const timeoutId = setTimeout(updateWidth, 100); // Also update after a short delay for initial render

    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame in ResizeObserver callback for smooth updates
      requestAnimationFrame(updateWidth);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
      // Also observe parent container if it's a scroll container
      const parent = containerRef.current.parentElement;
      if (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (
          parentStyle.overflow === "auto" ||
          parentStyle.overflowY === "auto" ||
          parentStyle.overflow === "scroll" ||
          parentStyle.overflowY === "scroll"
        ) {
          resizeObserver.observe(parent);
        }
      }
    }

    window.addEventListener("resize", updateWidth);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [images.length, images]);

  // Measure images after they load to get accurate dimensions
  useEffect(() => {
    const updateDimensions = () => {
      const updates = new Map<string, { width: number; height: number }>();

      imageRefs.current.forEach((imgElement, imageKey) => {
        if (imgElement?.naturalWidth && imgElement.naturalHeight) {
          // Get current dimensions from state (read directly, don't depend on it)
          const currentDims = imageDimensions.get(imageKey);
          const newWidth = imgElement.naturalWidth;
          const newHeight = imgElement.naturalHeight;

          // Only update if dimensions changed or don't exist
          if (currentDims?.width !== newWidth || currentDims.height !== newHeight) {
            updates.set(imageKey, {
              width: newWidth,
              height: newHeight,
            });
          }
        }
      });

      // Only update state if there are actual changes
      if (updates.size > 0) {
        setImageDimensions((prev) => {
          // Double-check to prevent unnecessary updates
          let hasRealChanges = false;
          const next = new Map(prev);
          updates.forEach((dims, key) => {
            const existing = prev.get(key);
            if (!existing || existing.width !== dims.width || existing.height !== dims.height) {
              next.set(key, dims);
              hasRealChanges = true;
            }
          });
          return hasRealChanges ? next : prev;
        });
      }
    };

    // Check for loaded images less frequently to avoid infinite loops
    const intervalId = setInterval(updateDimensions, 500);
    // Also update after a delay to allow images to start loading
    const timeoutId = setTimeout(updateDimensions, 200);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]); // Only depend on images, not imageDimensions to avoid loops

  // Calculate layout boxes - justified for square/standard, masonry for marble
  const layoutBoxes = useMemo(() => {
    if (images.length === 0) return [];

    const boxSpacing = 7; // Tight spacing for edge-to-edge fill
    const effectiveWidth = Math.max(containerWidth, 300);

    // For marble (masonry), use column-based masonry layout
    if (layout === "marble") {
      // Calculate responsive number of columns for dashboard
      // Dashboard has sidebar, so use fewer columns and smaller images
      // Always cap at 3 columns for dashboard to fit properly
      const numColumns = effectiveWidth < 640 ? 2 : 3;
      // Calculate column width more precisely to avoid rounding errors
      // Total spacing between columns = (numColumns - 1) * boxSpacing
      const totalSpacing = (numColumns - 1) * boxSpacing;
      const availableWidth = effectiveWidth - totalSpacing;
      const columnWidth = availableWidth / numColumns;
      const columnHeights = new Array(numColumns).fill(0);
      const boxes: LayoutBox[] = [];

      images.forEach((image, index) => {
        // Calculate item dimensions based on actual image dimensions or estimate
        let itemHeight: number;
        const imageKey = image.key ?? image.filename ?? `image-${index}`;

        // First try to get dimensions from state (measured from loaded images)
        const measuredDimensions = imageDimensions.get(imageKey);
        if (
          measuredDimensions?.width &&
          measuredDimensions.width > 0 &&
          measuredDimensions.height > 0
        ) {
          const aspectRatio = measuredDimensions.width / measuredDimensions.height;
          itemHeight = columnWidth / aspectRatio;
        } else {
          // Fallback to image metadata if available
          const width = typeof image.width === "number" ? image.width : undefined;
          const height = typeof image.height === "number" ? image.height : undefined;

          if (width && height && width > 0 && height > 0) {
            // Use actual aspect ratio to calculate height
            const aspectRatio = width / height;
            itemHeight = columnWidth / aspectRatio;
          } else {
            // Conservative estimate - use a more reasonable default aspect ratio
            // Most photos are between 3:4 (portrait) and 4:3 (landscape)
            // Use 4:3 as default (slightly landscape) which is common for photos
            itemHeight = columnWidth * 0.75; // 4:3 aspect ratio
          }
        }

        // Find the shortest column (true masonry algorithm)
        let shortestColumnIndex = 0;
        let shortestHeight: number = columnHeights[0] as number;
        for (let i = 1; i < numColumns; i++) {
          const currentHeight = columnHeights[i] as number;
          if (currentHeight < shortestHeight) {
            shortestHeight = currentHeight;
            shortestColumnIndex = i;
          }
        }

        // Calculate position - use precise calculation to avoid rounding errors
        const left = shortestColumnIndex * (columnWidth + boxSpacing);
        const top = columnHeights[shortestColumnIndex] as number;

        boxes.push({
          aspectRatio: columnWidth / itemHeight,
          top,
          left: Math.max(0, left),
          width: columnWidth, // Use exact columnWidth, no need to min with effectiveWidth
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
      const width = typeof image.width === "number" ? image.width : undefined;
      const height = typeof image.height === "number" ? image.height : undefined;

      // Use actual dimensions if available
      if (width && height) {
        return { width, height };
      }
      // For square layout, force 1:1 aspect ratio
      if (layout === "square") {
        return { width: 300, height: 300 };
      }
      // For standard layout, use 4:3 aspect ratio
      return { width: 400, height: 300 };
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const justified = justifiedLayout(items, {
      containerWidth: effectiveWidth,
      targetRowHeight,
      boxSpacing,
      containerPadding: 0,
    }) as { boxes: LayoutBox[] };

    return justified.boxes;
  }, [images, layout, containerWidth, imageDimensions]);

  // Calculate total height for the container
  const containerHeight = useMemo(() => {
    if (layoutBoxes.length === 0) return 0;

    if (layout === "marble") {
      // For masonry layout, find the maximum bottom position across all boxes
      // This ensures we account for the tallest column, not just the last box
      let maxBottom = 0;
      for (const box of layoutBoxes) {
        const bottom = box.top + box.height;
        if (bottom > maxBottom) {
          maxBottom = bottom;
        }
      }
      // Container padding-top (8px) + max bottom position + bottom padding (8px) + extra buffer (16px)
      // The extra buffer ensures images at the bottom aren't cut off due to rounding or measurement errors
      return 8 + maxBottom + 8 + 16;
    }

    // For other layouts, use the last box
    const lastBox = layoutBoxes[layoutBoxes.length - 1];
    if (!lastBox) return 0;
    // Container padding-top (8px) + last box position + last box height + bottom padding (8px) + extra buffer (16px)
    return 8 + lastBox.top + lastBox.height + 8 + 16;
  }, [layoutBoxes, layout]);

  // Infinite scroll using Intersection Observer
  // Find the nearest scrollable ancestor to use as root
  useEffect(() => {
    if (!hasNextPage || !onLoadMore || isFetchingNextPage) {
      if (observerTarget.current) {
        const observer = new IntersectionObserver(() => {});
        observer.unobserve(observerTarget.current);
      }
      return;
    }

    let isLoading = false;

    // Find the nearest scrollable ancestor (the scroll container from parent)
    const findScrollContainer = (element: HTMLElement | null): HTMLElement | null => {
      if (!element) return null;
      let parent = element.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (
          style.overflow === "auto" ||
          style.overflowY === "auto" ||
          style.overflow === "scroll" ||
          style.overflowY === "scroll"
        ) {
          return parent;
        }
        parent = parent.parentElement;
      }
      return null;
    };

    const scrollContainer = findScrollContainer(containerRef.current);

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasNextPage &&
          onLoadMore &&
          !isFetchingNextPage &&
          !isLoading
        ) {
          isLoading = true;
          onLoadMore();
          setTimeout(() => {
            isLoading = false;
          }, 1000);
        }
      },
      {
        threshold: 0,
        rootMargin: "3000px",
        root: scrollContainer, // Use scroll container as root for proper intersection detection
      }
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

  if (isLoading && images.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="sm" text="Ładowanie zdjęć..." />
      </div>
    );
  }

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
    <div ref={containerRef} className={`w-full overflow-hidden ${className}`}>
      <div
        style={{
          position: "relative",
          height: containerHeight,
          width: "100%",
          maxWidth: "100%",
          paddingTop: "8px",
          paddingBottom: "8px",
        }}
        className="overflow-hidden"
      >
        {images.map((image, index) => {
          const box = layoutBoxes[index];
          if (!box) return null;
          const imageKey = image.key ?? image.filename ?? image.id ?? `image-${index}`;

          return (
            <div
              key={imageKey}
              style={{
                position: "absolute",
                top: box.top + 8, // Container padding-top provides the spacing
                left: box.left,
                width: box.width,
                height: box.height,
                boxSizing: "border-box",
              }}
            >
              <div
                ref={(el) => {
                  if (el) {
                    // Find the img element inside to measure it
                    const img = el.querySelector("img");
                    if (img && !imageRefs.current.has(imageKey)) {
                      // Only set up listener if we haven't already for this image
                      imageRefs.current.set(imageKey, img);

                      // Update dimensions when image loads - check if already measured
                      const handleLoad = () => {
                        const currentDims = imageDimensions.get(imageKey);
                        if (
                          img.naturalWidth &&
                          img.naturalHeight &&
                          (!currentDims ||
                            currentDims.width !== img.naturalWidth ||
                            currentDims.height !== img.naturalHeight)
                        ) {
                          setImageDimensions((prev) => {
                            const next = new Map(prev);
                            next.set(imageKey, {
                              width: img.naturalWidth,
                              height: img.naturalHeight,
                            });
                            return next;
                          });
                        }
                      };

                      if (img.complete && img.naturalWidth && img.naturalHeight) {
                        // Image already loaded, measure it immediately but async to avoid loops
                        setTimeout(handleLoad, 0);
                      } else {
                        // Wait for image to load
                        img.addEventListener("load", handleLoad, { once: true });
                        img.addEventListener(
                          "error",
                          () => {
                            // Remove ref on error to prevent memory leaks
                            imageRefs.current.delete(imageKey);
                          },
                          { once: true }
                        );
                      }
                    }
                  } else {
                    imageRefs.current.delete(imageKey);
                  }
                }}
                style={{ width: "100%", height: "100%" }}
              >
                {renderImageItem(image, index, images)}
              </div>
            </div>
          );
        })}
      </div>
      {/* Observer target for infinite scroll */}
      {hasNextPage && <div ref={observerTarget} className="h-4" />}
      {isFetchingNextPage && (
        <div className="text-center py-8 text-gray-400">
          <Loading size="sm" text="Ładowanie więcej zdjęć..." />
        </div>
      )}
    </div>
  );
}
