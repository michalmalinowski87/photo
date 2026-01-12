"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { MasonryScroller, usePositioner, useContainerPosition, useScroller } from "masonic";
import Image from "next/image";
import type { ImageData } from "@/types/gallery";

interface MasonryGridProps {
  images: ImageData[];
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  isFetchingNextPage?: boolean;
  galleryId?: string;
}

export function MasonryGrid({
  images,
  hasNextPage,
  onLoadMore,
  isFetchingNextPage,
}: MasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Initialize with default values to prevent errors on first render
  const getInitialWidth = () => (typeof window !== "undefined" ? window.innerWidth : 1024);
  const getInitialHeight = () => (typeof window !== "undefined" ? window.innerHeight : 800);
  
  const [windowWidth, setWindowWidth] = useState(getInitialWidth);
  const [windowHeight, setWindowHeight] = useState(getInitialHeight);

  // Track window size for responsive column width
  useEffect(() => {
    const updateWindowSize = () => {
      setWindowWidth(window.innerWidth || 1024);
      setWindowHeight(window.innerHeight || 800);
    };

    updateWindowSize();
    window.addEventListener("resize", updateWindowSize);
    return () => window.removeEventListener("resize", updateWindowSize);
  }, []);

  // Calculate responsive column width (ensure minimum value)
  const columnWidth = windowWidth < 640 
    ? Math.max(150, Math.floor((windowWidth - 32) / 2)) // 2 columns on mobile
    : windowWidth < 1024
    ? Math.max(200, Math.floor((windowWidth - 48) / 3)) // 3 columns on tablet
    : windowWidth < 1280
    ? Math.max(240, Math.floor((windowWidth - 64) / 4)) // 4 columns on desktop
    : Math.max(240, Math.floor((windowWidth - 80) / 5)); // 5 columns on large screens

  const { offset, width } = useContainerPosition(containerRef, [windowWidth, windowHeight]);
  // Ensure width and columnWidth are always valid (never 0)
  const safeWidth = Math.max(width || windowWidth, 300);
  const safeColumnWidth = Math.max(columnWidth, 150);
  
  const positioner = usePositioner({ width: safeWidth, columnWidth: safeColumnWidth, columnGutter: 8 });
  const { scrollTop, isScrolling } = useScroller(offset);

  // Handle infinite scroll using onRender callback
  // onRender signature: (startIndex: number, stopIndex: number, items: any[]) => void
  const handleRender = useCallback(
    (startIndex: number, stopIndex: number, items: ImageData[]) => {
      // Load more when we're within 5 items of the end (using stopIndex - the last rendered index)
      if (hasNextPage && onLoadMore && !isFetchingNextPage && stopIndex >= images.length - 5) {
        onLoadMore();
      }
    },
    [hasNextPage, onLoadMore, isFetchingNextPage, images.length]
  );

  if (images.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        No images found
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef}>
        <MasonryScroller
          positioner={positioner}
          scrollTop={scrollTop}
          isScrolling={isScrolling}
          offset={offset}
          height={Math.max(windowHeight, 800)}
          containerRef={containerRef}
          items={images}
          itemKey={(data: ImageData, index: number) => `${data.key || data.url || 'image'}-${index}`}
          onRender={handleRender}
          overscanBy={5}
          render={({ data: image, index, width: itemWidth }) => {
            const imageUrl = image.bigThumbUrl || image.thumbnailUrl || image.url;
            const previewUrl = image.previewUrl || image.url;
            const fullImageUrl = image.url;
            const carouselThumbUrl = image.thumbnailUrl || (image as any).thumbUrl || image.bigThumbUrl || image.url;

            return (
              <div className="relative overflow-hidden rounded-lg bg-gray-100 cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:-translate-y-[2px] hover:shadow-lg active:scale-[1.015] active:-translate-y-[1px] active:shadow-md will-change-transform mb-2">
                <a
                  href={fullImageUrl}
                  data-src={previewUrl}
                  data-download-url={fullImageUrl}
                  data-thumb={carouselThumbUrl}
                  data-sub-html={image.key}
                  className="block w-full relative"
                >
                  <Image
                    src={imageUrl}
                    alt={image.alt || `Image ${index + 1}`}
                    width={itemWidth}
                    height={300}
                    className="w-full h-auto object-contain"
                    loading="lazy"
                    unoptimized={imageUrl.startsWith("http")}
                  />
                </a>
              </div>
            );
          }}
        />
      </div>
      {isFetchingNextPage && (
        <div className="text-center py-8 text-gray-500">
          Loading more images...
        </div>
      )}
    </div>
  );
}