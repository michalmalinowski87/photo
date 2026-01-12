"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import type { ImageData } from "@/types/gallery";

interface CarouselViewProps {
  images: ImageData[];
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  isFetchingNextPage?: boolean;
}

export function CarouselView({
  images,
  hasNextPage,
  onLoadMore,
  isFetchingNextPage,
}: CarouselViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Infinite scroll using Intersection Observer
  useEffect(() => {
    if (!hasNextPage || !onLoadMore || isFetchingNextPage) {
      return;
    }

    let isLoading = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && onLoadMore && !isFetchingNextPage && !isLoading) {
          isLoading = true;
          onLoadMore();
          setTimeout(() => {
            isLoading = false;
          }, 1000);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
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
    <div className="w-full -mx-4 px-4">
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {images.map((image, index) => {
          const imageUrl = image.previewUrl || image.bigThumbUrl || image.thumbnailUrl || image.url;
          const fullImageUrl = image.url;
          const carouselThumbUrl = image.thumbnailUrl || (image as any).thumbUrl || image.bigThumbUrl || image.url;

          return (
            <div
              key={`${image.key || image.url || 'image'}-${index}`}
              className="flex-shrink-0 w-[85vw] md:w-[70vw] lg:w-[60vw] xl:w-[50vw]"
              style={{ scrollSnapAlign: "start" }}
            >
              <a
                href={fullImageUrl}
                data-src={image.previewUrl || image.url}
                data-download-url={fullImageUrl}
                data-thumb={carouselThumbUrl}
                data-sub-html={image.key}
                className="block w-full h-full relative rounded-lg overflow-hidden bg-gray-100"
              >
                <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
                  <Image
                    src={imageUrl}
                    alt={image.alt || `Image ${index + 1}`}
                    fill
                    className="object-contain"
                    priority={index < 3}
                    loading={index < 3 ? undefined : "lazy"}
                    unoptimized={imageUrl.startsWith("http")}
                    sizes="(max-width: 768px) 85vw, (max-width: 1024px) 70vw, 60vw"
                  />
                </div>
              </a>
            </div>
          );
        })}
        {/* Observer target for infinite scroll */}
        {hasNextPage && (
          <div ref={observerTarget} className="flex-shrink-0 w-4" />
        )}
        {isFetchingNextPage && (
          <div className="flex-shrink-0 flex items-center justify-center w-32 text-gray-500">
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
}
