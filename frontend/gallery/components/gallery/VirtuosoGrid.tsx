"use client";

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import justifiedLayout from "justified-layout";
import Image from "next/image";
import type { ImageData } from "@/types/gallery";

export type GridLayout = "square" | "standard" | "marble" | "carousel";

interface VirtuosoGridProps {
  images: ImageData[];
  layout: GridLayout;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  isFetchingNextPage?: boolean;
  galleryId?: string;
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
}: VirtuosoGridProps) {
  const [containerWidth, setContainerWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth || 1200);
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener("resize", updateWidth);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  // Calculate layout boxes - justified for square/standard, masonry for marble
  const layoutBoxes = useMemo(() => {
    if (images.length === 0) return [];

    const boxSpacing = 8;
    const effectiveWidth = Math.max(containerWidth - 32, 300);

    // For marble (masonry), use column-based masonry layout
    if (layout === "marble") {
      // Calculate responsive number of columns
      const numColumns = effectiveWidth < 640 ? 2 : effectiveWidth < 1024 ? 3 : effectiveWidth < 1280 ? 4 : 5;
      const columnWidth = Math.floor((effectiveWidth - (numColumns - 1) * boxSpacing) / numColumns);
      const columnHeights = new Array(numColumns).fill(0);
      const boxes: LayoutBox[] = [];

      images.forEach((image, index) => {
        // Calculate item dimensions based on actual image dimensions or estimate
        let itemHeight: number;
        
        if (image.width && image.height && image.width > 0 && image.height > 0) {
          // Use actual aspect ratio to calculate height
          const aspectRatio = image.width / image.height;
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
        
        // Calculate position
        const left = shortestColumnIndex * (columnWidth + boxSpacing);
        const top = columnHeights[shortestColumnIndex];
        
        boxes.push({
          aspectRatio: columnWidth / itemHeight,
          top,
          left,
          width: columnWidth,
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
  }, [images, layout, containerWidth]);

  // Calculate total height for the container
  const containerHeight = useMemo(() => {
    if (layoutBoxes.length === 0) return 0;
    const lastBox = layoutBoxes[layoutBoxes.length - 1];
    return lastBox.top + lastBox.height + 32; // Add padding at bottom
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
      <div className="text-center py-16 text-gray-500">
        No images found
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      <div style={{ position: "relative", height: containerHeight, width: "100%" }}>
        {images.map((image, index) => {
          const box = layoutBoxes[index];
          if (!box) return null;

          const imageUrl = image.bigThumbUrl || image.thumbnailUrl || image.url;
          const previewUrl = image.previewUrl || image.url;
          const fullImageUrl = image.url;
          const carouselThumbUrl = image.thumbnailUrl || (image as any).thumbUrl || image.bigThumbUrl || image.url;

          const imageClasses =
            layout === "square"
              ? "object-cover rounded-lg"
              : layout === "standard"
              ? "object-contain"
              : "object-cover rounded-lg";

          return (
            <div
              key={`${image.key || image.url || 'image'}-${index}`}
              style={{
                position: "absolute",
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
              }}
              className="overflow-hidden bg-gray-100 cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:-translate-y-[2px] hover:shadow-lg active:scale-[1.015] active:-translate-y-[1px] active:shadow-md will-change-transform"
            >
              <a
                href={fullImageUrl}
                data-src={previewUrl}
                data-download-url={fullImageUrl}
                data-thumb={carouselThumbUrl}
                data-sub-html={image.key}
                className="block w-full h-full relative"
              >
                <Image
                  src={imageUrl}
                  alt={image.alt || `Image ${index + 1}`}
                  fill
                  className={imageClasses}
                  priority={index < 3} // Prioritize first 3 images for LCP
                  loading={index < 3 ? undefined : "lazy"}
                  unoptimized={imageUrl.startsWith("http")}
                />
              </a>
            </div>
          );
        })}
      </div>
      {/* Observer target for infinite scroll - only show if there are more pages */}
      {hasNextPage && <div ref={observerTarget} className="h-4" />}
      {isFetchingNextPage && (
        <div className="text-center py-8 text-gray-500">
          Loading more images...
        </div>
      )}
    </div>
  );
}
