"use client";

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import justifiedLayout from "justified-layout";
import Image from "next/image";
import { Sparkles, BookOpen, BookOpenCheck, Image as ImageIcon, ImagePlus } from "lucide-react";
import type { ImageData } from "@/types/gallery";
import { EmptyState } from "./EmptyState";
import { RetryableImage } from "../ui/RetryableImage";

// Module-level cache to persist across React StrictMode renders
// This prevents duplicate layout calculations when StrictMode runs useMemo twice
const layoutCache = new Map<string, LayoutBox[]>();

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
  // Store measured dimensions for images that didn't come with width/height from the API.
  // This helps preserve original portrait/landscape ratios, especially for small sets.
  const [imageDimensions, setImageDimensions] = useState<
    Map<string, { width: number; height: number }>
  >(new Map());
  
  // Track extraction runs to prevent duplicate processing from React StrictMode
  const extractionRunIdRef = useRef<number>(0);
  
  // Extract dimensions from loaded images - use DOM-based extraction like dashboard app
  // This prevents React StrictMode double-render issues from onLoadingComplete callbacks
  useEffect(() => {
    if (layout !== "marble") {
      // For non-marble layouts, dimensions aren't needed
      return;
    }

    if (!containerRef.current || images.length === 0) {
      return;
    }

    // Increment run ID to track this extraction cycle (prevents duplicate processing from StrictMode)
    extractionRunIdRef.current += 1;
    const currentRunId = extractionRunIdRef.current;

    // Create a Set of valid image keys for quick lookup
    const validImageKeys = new Set(
      images.map((img) => img.key ?? "").filter(Boolean)
    );

    const extractDimensions = () => {
      // Skip if this is a stale extraction run (StrictMode double-execution)
      if (extractionRunIdRef.current !== currentRunId) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:95',message:'extractDimensions - skipped stale run',data:{currentRunId,activeRunId:extractionRunIdRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return;
      }
      const container = containerRef.current;
      if (!container) return;

      // Look for images in the container
      const imgElements = Array.from(container.querySelectorAll("img"));
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
            // Only update if this image is still in the current images array and not already added
            // Also check that dimensions haven't changed (prevents duplicate updates from StrictMode)
            if (validImageKeys.has(key)) {
              const existing = prev.get(key);
              if (!existing || existing.width !== dims.width || existing.height !== dims.height) {
                updated.set(key, dims);
                hasNew = true;
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:120',message:'extractDimensions - adding dimension',data:{imageKey:key,width:dims.width,height:dims.height,prevSize:prev.size,hasExisting:!!existing},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
              }
            }
          });

          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:130',message:'extractDimensions - result',data:{hasNew,prevSize:prev.size,nextSize:hasNew?updated.size:prev.size,addedCount:dimensionsToAdd.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion

          // Only return new Map if there are actual changes (prevents unnecessary re-renders)
          return hasNew ? updated : prev;
        });
      }
    };

    // Extract dimensions immediately for already-loaded images, then periodically
    extractDimensions(); // Immediate extraction for already-loaded images

    // Use multiple timeouts to catch images as they load, but batch updates
    const timeoutIds: NodeJS.Timeout[] = [];
    [100, 300, 600].forEach((delay) => {
      const timeoutId = setTimeout(() => {
        extractDimensions();
      }, delay);
      timeoutIds.push(timeoutId);
    });

    return () => {
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [images, layout]); // Re-run when images or layout change, but NOT when imageDimensions changes
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:76',message:'images prop changed',data:{imagesLength:images.length,imageKeys:images.map(img => img.key).slice(0,5),imagesReference:images},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }, [images]);
  // #endregion

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
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:89',message:'containerWidth update',data:{oldWidth:containerWidth,newWidth:width,clientWidth:containerRef.current.clientWidth,maxWidth},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
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
  // Use imageDimensions directly in dependency array like dashboard app
  // React's useMemo will handle caching - we ensure Map reference stability by returning prev when unchanged
  const layoutBoxes = useMemo(() => {
    // Create a composite key from all dependencies
    const layoutKey = `${images.length}:${layout}:${containerWidth}:${imageDimensions.size}`;
    
    // Check module-level cache (persists across React StrictMode renders)
    const cached = layoutCache.get(layoutKey);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:228',message:'layoutBoxes useMemo called',data:{layoutKey,cacheSize:layoutCache.size,hasCached:!!cached,cacheKeys:Array.from(layoutCache.keys()).slice(-5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (cached) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:233',message:'layoutBoxes using cached result (module cache)',data:{layoutKey,imagesLength:images.length,layout,containerWidth,imageDimensionsSize:imageDimensions.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return cached;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:239',message:'layoutBoxes recalculating',data:{layoutKey,imagesLength:images.length,layout,containerWidth,imageDimensionsSize:imageDimensions.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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

        // Cache result before returning
        layoutCache.set(layoutKey, boxes);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:322',message:'layoutBoxes cache set (marble single-row)',data:{layoutKey,cacheSize:layoutCache.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
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

      // Cache result before returning
      layoutCache.set(layoutKey, boxes);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:380',message:'layoutBoxes cache set (marble multi-column)',data:{layoutKey,cacheSize:layoutCache.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
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

    const result = justified.boxes as LayoutBox[];
    
    // Cache in module-level Map (persists across React StrictMode renders)
    layoutCache.set(layoutKey, result);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VirtuosoGrid.tsx:407',message:'layoutBoxes cache set',data:{layoutKey,cacheSize:layoutCache.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Limit cache size to prevent memory leaks (keep last 50 calculations)
    if (layoutCache.size > 50) {
      const firstKey = layoutCache.keys().next().value;
      layoutCache.delete(firstKey);
    }
    
    return result;
  }, [images, layout, containerWidth, imageDimensions]); // Include imageDimensions to recalculate when extracted dimensions change

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
    <div ref={containerRef} className={`w-full overflow-hidden ${hideBorders ? "bg-transparent" : "bg-white"}`}>
      <div style={{ position: "relative", height: containerHeight, width: "100%", maxWidth: "100%", paddingTop: "8px", paddingBottom: "8px" }} className={`overflow-hidden ${hideBorders ? "bg-transparent" : "bg-white"}`}>
        {images.map((image, index) => {
          const box = layoutBoxes[index];
          if (!box) return null;

          const imageUrl = image.bigThumbUrl || image.thumbnailUrl || image.url;
          const previewUrl = image.previewUrl || image.url;
          // Best available; original never exposed in gallery app
          const fullImageUrl = image.url ?? image.previewUrl ?? image.bigThumbUrl ?? image.thumbnailUrl;
          const carouselThumbUrl = image.thumbnailUrl || (image as any).thumbUrl || image.bigThumbUrl || image.url;

          const marbleMaxColumns =
            containerWidth < 640 ? 2 : containerWidth < 1024 ? 3 : 4;
          const isSingleRowMarble = layout === "marble" && images.length <= marbleMaxColumns;

          const imageClasses =
            hideBorders
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
          const canAddToPrint = showPhotoPrintUi && (inPrint || photoPrintKeys.length < photoPrintCount);
          const showBookPrint =
            isSelected && (canAddToBook || canAddToPrint) && (onTogglePhotoBook || onTogglePhotoPrint);

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
                <RetryableImage
                  image={image}
                  alt={image.alt || `Image ${index + 1}`}
                  fill
                  className={imageClasses}
                  preferredSize="bigthumb"
                  priority={index < 3} // Prioritize first 3 images for LCP
                  loading={index < 3 ? undefined : "lazy"}
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
        <div className="text-center py-8 text-gray-400 bg-white">
          Loading more images...
        </div>
      )}
    </div>
  );
}
