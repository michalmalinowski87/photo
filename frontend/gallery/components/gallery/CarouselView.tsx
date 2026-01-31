"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import { RetryableImage } from "../ui/RetryableImage";
import { Sparkles } from "lucide-react";
import type { ImageData } from "@/types/gallery";
import { EmptyState } from "./EmptyState";
import { ThreeDotsIndicator } from "../ui/Loading";

interface CarouselViewProps {
  images: ImageData[];
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  isFetchingNextPage?: boolean;
  /** When set, presigned URL is fetched on demand when CloudFront fails */
  galleryId?: string;
}

export function CarouselView({
  images,
  hasNextPage,
  onLoadMore,
  isFetchingNextPage,
  galleryId,
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
      { threshold: 0, rootMargin: "800px" } // Prefetch sooner when scrolling horizontally
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
          // Best available; original never exposed in gallery app
          const fullImageUrl = image.url ?? image.previewUrl ?? image.bigThumbUrl ?? image.thumbnailUrl;
          const carouselThumbUrl = image.thumbnailUrl || (image as any).thumbUrl || image.bigThumbUrl || image.url;

          return (
            <div
              key={`${image.key || image.previewUrl || image.url || 'image'}-${index}`}
              className="flex-shrink-0 w-[85vw] md:w-[70vw] lg:w-[60vw] xl:w-[50vw]"
              style={{ scrollSnapAlign: "start" }}
            >
              <a
                href={fullImageUrl}
                data-src={image.previewUrl || image.url}
                data-download-url={fullImageUrl}
                data-thumb={carouselThumbUrl}
                data-sub-html={image.key}
                className="block w-full h-full relative rounded-lg overflow-hidden bg-gray-100 transition-all duration-300 ease-out hover:scale-[1.02] hover:-translate-y-[2px] hover:shadow-lg active:scale-[1.015] active:-translate-y-[1px] active:shadow-md will-change-transform"
              >
                <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
                  <RetryableImage
                    image={image}
                    alt={image.alt || `Image ${index + 1}`}
                    fill
                    className="object-contain"
                    preferredSize="bigthumb"
                    priority={index < 3}
                    loading={index < 3 ? undefined : "lazy"}
                    sizes="(max-width: 768px) 85vw, (max-width: 1024px) 70vw, 60vw"
                    galleryId={galleryId}
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
          <div className="flex-shrink-0 flex flex-col items-center justify-center gap-3 min-w-[7rem] py-4">
            <ThreeDotsIndicator />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Ładowanie zdjęć...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
