"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import type { ImageData } from "@/types/gallery";
import { EmptyState } from "./EmptyState";

export type GridLayout = "square" | "standard" | "marble" | "carousel";

interface ImageGridProps {
  images: ImageData[];
  layout?: GridLayout;
  onLayoutChange?: (layout: GridLayout) => void;
  selectedKeys?: Set<string>;
  onImageSelect?: (key: string) => void;
}

export function ImageGrid({
  images,
  layout: controlledLayout,
  onLayoutChange,
  selectedKeys = new Set(),
  onImageSelect,
}: ImageGridProps) {
  const [internalLayout, setInternalLayout] = useState<GridLayout>("standard");
  
  // Use controlled layout if provided, otherwise use internal state
  const layout = controlledLayout ?? internalLayout;

  // Load layout preference from localStorage (only if uncontrolled)
  useEffect(() => {
    if (controlledLayout === undefined) {
      const savedLayout = localStorage.getItem("gallery-grid-layout") as GridLayout;
      if (savedLayout && ["square", "standard", "marble", "carousel"].includes(savedLayout)) {
        setInternalLayout(savedLayout);
      }
    }
  }, [controlledLayout]);

  // Save layout preference to localStorage
  const handleLayoutChange = (newLayout: GridLayout) => {
    if (onLayoutChange) {
      onLayoutChange(newLayout);
    } else {
      setInternalLayout(newLayout);
      localStorage.setItem("gallery-grid-layout", newLayout);
    }
  };

  const getGridClasses = () => {
    switch (layout) {
      case "square":
        return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";
      case "standard":
      default:
        return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";
    }
  };

  const getImageClasses = (image: ImageData) => {
    const selectedClasses = selectedKeys.has(image.key) ? "ring-2 ring-primary ring-offset-2" : "";

    switch (layout) {
      case "square":
        // Square layout: rounded corners, background, overflow hidden
        const squareBaseClasses = "relative overflow-hidden rounded-lg bg-gray-100 cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:-translate-y-[2px] hover:shadow-lg active:scale-[1.015] active:-translate-y-[1px] active:shadow-md will-change-transform";
        return `${squareBaseClasses} aspect-square ${selectedClasses}`;
      case "standard":
      default:
        // Standard layout: no background, no rounded corners, show rough edges (natural image edges)
        const standardBaseClasses = "relative cursor-pointer transition-all duration-300 ease-out hover:scale-[1.02] hover:-translate-y-[2px] hover:shadow-lg active:scale-[1.015] active:-translate-y-[1px] active:shadow-md will-change-transform";
        return `${standardBaseClasses} aspect-[4/3] ${selectedClasses}`;
    }
  };

  const getImageDimensions = () => {
    switch (layout) {
      case "square":
        return { width: 300, height: 300 };
      case "standard":
      default:
        return { width: 300, height: 300 };
    }
  };

  const getImageUrl = (image: ImageData) => {
    // Use bigThumbUrl for gallery miniatures (grid thumbnails) - prioritize for all layouts
    return image.bigThumbUrl || image.thumbnailUrl || image.url;
  };

  const dimensions = getImageDimensions();

  return (
    <div className="w-full">

      <div className={getGridClasses()}>
        {images.map((image, index) => {
          const isSelected = selectedKeys.has(image.key);
          const imageUrl = getImageUrl(image); // bigThumbUrl for gallery miniatures
          // Preview quality for carousel preview (main image in lightbox) - use previewUrl
          const previewUrl = image.previewUrl || image.url;
          // Best available for lightbox/download; original never exposed in gallery app
          const fullImageUrl = image.url ?? image.previewUrl ?? image.bigThumbUrl ?? image.thumbnailUrl;
          // Thumbnails for carousel thumbnails strip (bottom of lightGallery)
          const carouselThumbUrl = image.thumbnailUrl || image.thumbUrl || image.bigThumbUrl || image.url;
          // Ensure unique key by combining image.key with index (fallback to URL if key is missing)
          const uniqueKey = image.key ? `${image.key}-${index}` : image.previewUrl || image.url || `image-${index}`;
          // Prioritize first 3 images for LCP (increases chance that LCP image has priority)
          const isPriority = index < 3;

          return (
            <div
              key={uniqueKey}
              className={getImageClasses(image)}
            >
              {/* Anchor for lightgallery - it handles clicks automatically */}
              <a
                href={fullImageUrl}
                data-src={previewUrl}
                data-download-url={fullImageUrl}
                data-thumb={carouselThumbUrl}
                data-sub-html={image.key}
                className="block w-full h-full relative"
              >
                {layout === "square" ? (
                  <Image
                    src={imageUrl ?? ""}
                    alt={image.alt || `Image ${index + 1}`}
                    fill
                    className="object-cover"
                    priority={isPriority} // Prioritize first 3 images for LCP
                    loading={isPriority ? undefined : "lazy"}
                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    unoptimized={(imageUrl ?? "").startsWith("http")} // Don't optimize external URLs
                  />
                ) : (
                  <Image
                    src={imageUrl ?? ""}
                    alt={image.alt || `Image ${index + 1}`}
                    fill
                    className="object-contain"
                    priority={isPriority} // Prioritize first 3 images for LCP
                    loading={isPriority ? undefined : "lazy"}
                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    unoptimized={(imageUrl ?? "").startsWith("http")}
                  />
                )}
              </a>

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {images.length === 0 && (
        <EmptyState
          icon={<Sparkles size={64} />}
          title="Brak zdjęć"
          description="W tej galerii nie ma jeszcze żadnych zdjęć."
        />
      )}
    </div>
  );
}
