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
  const containerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  // Store actual image dimensions extracted from loaded images
  const [imageDimensions, setImageDimensions] = useState<
    Map<string, { width: number; height: number }>
  >(new Map());
  // Track previous images length to detect actual image changes (not dimension extraction updates)
  const prevImagesLengthRef = useRef<number>(images.length);

  // We render immediately with estimates and refine as dimensions are extracted

  // Update container width on resize and when images change
  // Use actual container width (not window width) to account for sidebar
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        // Use full container width (parent already handles padding)
        // Ensure width doesn't exceed viewport
        const maxWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
        const width = Math.min(containerRef.current.clientWidth || maxWidth, maxWidth);
        setContainerWidth(width);
      }
    };

    // Small delay to ensure DOM is ready - match gallery app approach
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
  }, [images.length, images]);

  // Extract dimensions from loaded images - only for images in current images array
  useEffect(() => {
    if (layout !== "marble") {
      // For non-marble layouts, dimensions aren't needed
      return;
    }

    if (!containerRef.current || images.length === 0) {
      return;
    }

    // No longer reset dimensionsReady - we render immediately with estimates and refine as dimensions are extracted
    // Update ref to track current images length for future reference
    prevImagesLengthRef.current = images.length;

    // Create a Set of valid image keys for quick lookup
    const validImageKeys = new Set(
      images.map((img) => img.key ?? img.filename ?? "").filter(Boolean)
    );

    const extractDimensions = () => {
      const container = containerRef.current;
      if (!container) return;

      // Look for images in the container and any hidden extraction containers (siblings)
      const parent = container.parentElement;
      const searchRoot = parent ?? container;
      const imgElements = Array.from(searchRoot.querySelectorAll("img"));
      const dimensionsToAdd = new Map<string, { width: number; height: number }>();

      imgElements.forEach((img) => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          // Find the image key from the parent structure
          const imageContainer = img.closest("[data-image-key]");
          if (imageContainer) {
            const imageKey = imageContainer.getAttribute("data-image-key");
            // Only extract dimensions for images that are in the current images array
            if (imageKey && validImageKeys.has(imageKey)) {
              dimensionsToAdd.set(imageKey, {
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            }
          }
        }
      });

      if (dimensionsToAdd.size > 0) {
        setImageDimensions((prev) => {
          const updated = new Map(prev);
          let hasNew = false;
          dimensionsToAdd.forEach((dims, key) => {
            // Only update if this image is still in the current images array
            if (validImageKeys.has(key) && !updated.has(key)) {
              updated.set(key, dims);
              hasNew = true;
            }
          });

          return hasNew ? updated : prev;
        });
      }
    };

    // Extract dimensions immediately for already-loaded images, then with a small delay for others
    extractDimensions(); // Immediate extraction for already-loaded images

    const timeoutId = setTimeout(() => {
      extractDimensions();
    }, 300); // Give images time to load, but don't wait too long

    // Also extract on image load events - use event delegation on parent for better performance
    const container = containerRef.current;
    const parent = container?.parentElement;
    const loadHandler = (e: Event) => {
      const img = e.target as HTMLImageElement;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const imageContainer = img.closest("[data-image-key]");
        if (imageContainer) {
          const imageKey = imageContainer.getAttribute("data-image-key");
          // Only extract dimensions for images that are in the current images array
          if (imageKey && validImageKeys.has(imageKey)) {
            setImageDimensions((prev) => {
              if (!prev.has(imageKey)) {
                const updated = new Map(prev);
                updated.set(imageKey, {
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                });
                return updated;
              }
              return prev;
            });
          }
        }
      }
    };

    // Use event delegation on parent to catch images in hidden container too
    if (parent) {
      parent.addEventListener("load", loadHandler, true);
    } else if (container) {
      container.addEventListener("load", loadHandler, true);
    }

    return () => {
      clearTimeout(timeoutId);
      if (parent) {
        parent.removeEventListener("load", loadHandler, true);
      } else if (container) {
        container.removeEventListener("load", loadHandler, true);
      }
    };
  }, [images, layout]); // Re-run when images or layout change, but NOT when imageDimensions changes

  // Calculate layout boxes - justified for square/standard, masonry for marble
  // Always calculate layout immediately (like gallery app) - use estimates if dimensions not available
  const layoutBoxes = useMemo(() => {
    if (images.length === 0) return [];

    const boxSpacing = 7; // Tight spacing for edge-to-edge fill
    const effectiveWidth = Math.max(containerWidth, 300);

    // For marble (masonry), use column-based masonry layout
    if (layout === "marble") {
      // Calculate responsive number of columns - match gallery app logic
      const numColumns = effectiveWidth < 640 ? 2 : effectiveWidth < 1024 ? 3 : 4;
      // Calculate column width using Math.floor like gallery app for precision
      const columnWidth = Math.floor((effectiveWidth - (numColumns - 1) * boxSpacing) / numColumns);
      const columnHeights = new Array(numColumns).fill(0);
      const boxes: LayoutBox[] = [];

      images.forEach((image, index) => {
        // Calculate item dimensions based on actual image dimensions or estimate
        // Match gallery app approach: use image.width/image.height if available, otherwise estimate
        let itemHeight: number;

        // Check for dimensions from API first, then from extracted dimensions
        const imageKey = image.key ?? image.filename ?? `image-${index}`;
        const extractedDims = imageDimensions.get(imageKey);
        const imageWidth = typeof image.width === "number" ? image.width : extractedDims?.width;
        const imageHeight = typeof image.height === "number" ? image.height : extractedDims?.height;

        if (imageWidth && imageHeight && imageWidth > 0 && imageHeight > 0) {
          // Use actual aspect ratio to calculate height
          const aspectRatio = imageWidth / imageHeight;
          itemHeight = columnWidth / aspectRatio;
        } else {
          // Estimate based on index for variety (alternating between portrait and landscape)
          // This creates natural variation in masonry layout
          const isPortrait = index % 3 !== 0; // Roughly 2/3 portrait, 1/3 landscape
          itemHeight = isPortrait
            ? columnWidth * 1.4 // Portrait: taller
            : columnWidth * 0.75; // Landscape: shorter
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

        // Calculate position - match gallery app: ensure it doesn't exceed container width
        const left = Math.min(
          shortestColumnIndex * (columnWidth + boxSpacing),
          effectiveWidth - columnWidth
        );
        const top = columnHeights[shortestColumnIndex] as number;

        boxes.push({
          aspectRatio: columnWidth / itemHeight,
          top,
          left: Math.max(0, left), // Ensure left is never negative
          width: Math.min(columnWidth, effectiveWidth - left), // Ensure width doesn't exceed container - match gallery app
          height: itemHeight,
        });

        // Update column height for next item
        columnHeights[shortestColumnIndex] = top + itemHeight + boxSpacing;
      });

      return boxes;
    }

    // For square and standard, use justified layout
    const targetRowHeight = layout === "square" ? 200 : 200;

    // Get image dimensions - match gallery app: use API dimensions only, not extracted
    const items = images.map((image) => {
      // Use actual dimensions if available from API - match gallery app
      if (typeof image.width === "number" && typeof image.height === "number") {
        return { width: image.width, height: image.height };
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
  }, [images, layout, containerWidth, imageDimensions]); // Include imageDimensions to recalculate when extracted dimensions change

  // Calculate total height for the container
  // Match gallery app approach: use last box for all layouts (simpler and more reliable)
  const containerHeight = useMemo(() => {
    if (layoutBoxes.length === 0) return 0;

    // Use last box for all layouts (match gallery app) - simpler and more reliable
    const lastBox = layoutBoxes[layoutBoxes.length - 1];
    if (!lastBox) return 0;

    // For marble, also check max bottom to ensure we capture tallest column
    if (layout === "marble") {
      let maxBottom = 0;
      for (const box of layoutBoxes) {
        const bottom = box.top + box.height;
        if (bottom > maxBottom) {
          maxBottom = bottom;
        }
      }
      const heightFromMax = 8 + maxBottom + 8 + 16;
      const heightFromLast = 8 + lastBox.top + lastBox.height + 8 + 16;

      // Use the larger of the two to ensure we capture the tallest column
      return Math.max(heightFromMax, heightFromLast);
    }

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
    <div ref={containerRef} className={`w-full overflow-hidden relative ${className}`}>
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
              <div style={{ width: "100%", height: "100%" }} data-image-key={imageKey}>
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
