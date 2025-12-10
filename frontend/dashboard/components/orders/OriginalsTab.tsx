import { HandHeart } from "lucide-react";
import { useEffect, useRef, useCallback } from "react";

import { ImageFallbackUrls } from "../../lib/image-fallback";
import { EmptyState } from "../ui/empty-state/EmptyState";
import { LazyRetryableImage } from "../ui/LazyRetryableImage";
import { GalleryLoading, Loading } from "../ui/loading/Loading";

interface GalleryImage {
  id?: string;
  key?: string;
  filename?: string;
  url?: string;
  thumbUrl?: string;
  thumbUrlFallback?: string;
  previewUrl?: string;
  previewUrlFallback?: string;
  bigThumbUrl?: string;
  bigThumbUrlFallback?: string;
  [key: string]: unknown;
}

interface OriginalsTabProps {
  images: GalleryImage[];
  selectedKeys: string[];
  selectionEnabled: boolean;
  deliveryStatus?: string;
  isLoading?: boolean;
  error?: unknown;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function OriginalsTab({
  images,
  selectedKeys,
  selectionEnabled,
  deliveryStatus,
  isLoading = false,
  error,
  fetchNextPage,
  hasNextPage = false,
  isFetchingNextPage = false,
}: OriginalsTabProps) {
  const shouldShowAllImages = !selectionEnabled;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarDetectedRef = useRef(false);
  const imagesCountWhenScrollbarAppearedRef = useRef<number | null>(null);
  const measuredRowHeightRef = useRef<number | null>(null);

  // Measure actual row height from DOM - adapts to any item height
  const measureRowHeight = useCallback(() => {
    if (!gridContainerRef.current || images.length === 0) {
      return null;
    }

    const grid = gridContainerRef.current;
    const children = Array.from(grid.children) as HTMLElement[];
    
    if (children.length === 0) {
      return null;
    }

    // Calculate columns based on viewport width
    const viewportWidth = grid.clientWidth;
    let columns = 2; // Default for mobile
    if (viewportWidth >= 1280) columns = 6; // xl
    else if (viewportWidth >= 1024) columns = 5; // lg
    else if (viewportWidth >= 768) columns = 4; // md
    else if (viewportWidth >= 640) columns = 3; // sm

    // Measure height of first few rows to get average
    // Need at least 2 rows to calculate row height accurately
    const minItemsForMeasurement = columns * 2;
    if (children.length < minItemsForMeasurement) {
      return null;
    }

    // Get positions of items in first two rows
    const firstRowItems = children.slice(0, columns);
    const secondRowItems = children.slice(columns, columns * 2);
    
    if (firstRowItems.length === 0 || secondRowItems.length === 0) {
      return null;
    }

    // Get top position of first item in first row
    const firstItemTop = firstRowItems[0].offsetTop;
    // Get top position of first item in second row
    const secondRowFirstItemTop = secondRowItems[0].offsetTop;
    
    // Calculate row height (difference between rows)
    const rowHeight = secondRowFirstItemTop - firstItemTop;
    
    // Validate measurement (should be positive and reasonable)
    if (rowHeight > 0 && rowHeight < 1000) {
      return rowHeight;
    }

    return null;
  }, [images.length]);

  // Update measured row height when images change or on resize
  useEffect(() => {
    const updateRowHeight = () => {
      const measured = measureRowHeight();
      if (measured !== null) {
        measuredRowHeightRef.current = measured;
      }
    };

    // Measure after a short delay to ensure DOM is updated
    const timeoutId = setTimeout(updateRowHeight, 100);
    
    // Also measure on window resize
    window.addEventListener('resize', updateRowHeight);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateRowHeight);
    };
  }, [images.length, measureRowHeight]);

  // Auto-fetch strategy for initial load:
  // 1. Detect when scrollbar first appears
  // 2. Note how many images we had when scrollbar appeared
  // 3. Fetch until we have double that amount (if 30 images needed scroll, fetch until 60)
  // 4. After initial prefetch, use normal smooth scrolling strategy
  // 5. If we have selectedKeys, ensure we fetch at least that many images
  useEffect(() => {
    if (!scrollContainerRef.current || isFetchingNextPage || error || !fetchNextPage) {
      return undefined;
    }

    // If we have selectedKeys, ensure we fetch at least that many images
    // This handles the case where we have 51 selectedKeys but only 50 images loaded
    if (selectedKeys.length > 0 && images.length < selectedKeys.length && hasNextPage) {
      const timeoutId = setTimeout(() => {
        if (hasNextPage && !isFetchingNextPage && !error && fetchNextPage) {
          void fetchNextPage();
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }

    // Skip auto-fetch if no images loaded yet
    if (images.length === 0) {
      return undefined;
    }

    const container = scrollContainerRef.current;
    const needsScrolling = container.scrollHeight > container.clientHeight;

    // Detect when scrollbar first appears
    if (needsScrolling && !scrollbarDetectedRef.current) {
      scrollbarDetectedRef.current = true;
      imagesCountWhenScrollbarAppearedRef.current = images.length;
    }

    // Initial prefetch phase: fetch double the images count when scrollbar appeared
    if (scrollbarDetectedRef.current && imagesCountWhenScrollbarAppearedRef.current !== null) {
      const targetImagesCount = imagesCountWhenScrollbarAppearedRef.current * 2;
      
      if (images.length < targetImagesCount && hasNextPage) {
        // Still in initial prefetch phase - fetch until we have double
        const timeoutId = setTimeout(() => {
          if (hasNextPage && !isFetchingNextPage && !error && fetchNextPage) {
            void fetchNextPage();
          }
        }, 100);
        return () => clearTimeout(timeoutId);
      }
      // After initial prefetch is complete, scroll handler will take over
      return undefined;
    }

    // Before scrollbar appears, keep fetching until we get scroll
    if (!scrollbarDetectedRef.current && !needsScrolling && hasNextPage) {
      const timeoutId = setTimeout(() => {
        if (hasNextPage && !isFetchingNextPage && !error && fetchNextPage) {
          void fetchNextPage();
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }

    // No cleanup needed for other cases
    return undefined;
  }, [images.length, hasNextPage, isFetchingNextPage, error, fetchNextPage, selectedKeys.length]);

  // Helper to render image grid with infinite scroll support
  const renderImageGrid = (
    imagesToRender: GalleryImage[],
    _highlightSelected = false,
    enableInfiniteScroll = false
  ) => {
    if (enableInfiniteScroll) {
      // For infinite scroll, wrap in scrollable container with prefetching
      return (
        <div
          ref={scrollContainerRef}
          className="w-full overflow-auto table-scrollbar"
          style={{ height: "calc(100vh - 400px)", minHeight: "600px", overscrollBehavior: "none" }}
          onScroll={(e) => {
            const target = e.target as HTMLElement;
            const scrollTop = target.scrollTop;
            const clientHeight = target.clientHeight;

            // Use item-based prefetching for smooth scrolling
            // Calculate based on actual grid layout (responsive: 2-6 columns)
            // Measure row height dynamically to adapt to any item height
            // Calculate columns based on viewport width
            const viewportWidth = target.clientWidth;
            let columns = 2; // Default for mobile
            if (viewportWidth >= 1280) columns = 6; // xl
            else if (viewportWidth >= 1024) columns = 5; // lg
            else if (viewportWidth >= 768) columns = 4; // md
            else if (viewportWidth >= 640) columns = 3; // sm

            // Use measured row height if available, otherwise fall back to estimate
            // Try to measure on-the-fly if not measured yet
            let rowHeight = measuredRowHeightRef.current;
            if (rowHeight === null && gridContainerRef.current) {
              const measured = measureRowHeight();
              if (measured !== null) {
                rowHeight = measured;
                measuredRowHeightRef.current = measured;
              }
            }
            // Fallback to estimate if measurement failed
            const estimatedRowHeight = rowHeight ?? 200; // Default fallback: 200px per row
            const totalItemsRendered = imagesToRender.length;

            // Calculate which item index is currently at the bottom of viewport
            const scrollBottom = scrollTop + clientHeight;
            const rowsScrolled = Math.floor(scrollBottom / estimatedRowHeight);
            const itemsScrolled = rowsScrolled * columns; // Items = rows * columns per row

            // Calculate distance from end (same logic as gallery photos)
            const distanceFromEnd = totalItemsRendered - itemsScrolled;
            // Prefetch threshold: account for page size (typically limit=50)
            // Use 1 page worth to ensure smooth scrolling
            const prefetchThreshold = 50; // Threshold for originals with typical limit=50

            // Also check if we have selectedKeys and need to fetch more to match them
            const needsMoreForSelectedKeys = selectedKeys.length > 0 && totalItemsRendered < selectedKeys.length;

            // Don't fetch if there's an error or already fetching
            if (
              (distanceFromEnd <= prefetchThreshold || needsMoreForSelectedKeys) &&
              hasNextPage &&
              !isFetchingNextPage &&
              !error &&
              fetchNextPage
            ) {
              void fetchNextPage();
            }
          }}
        >
          <div 
            ref={gridContainerRef}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-8"
          >
            {imagesToRender.map((img, idx) => {
              const imgKey = img.key ?? img.filename ?? img.id ?? `img-${idx}`;
              return (
                <div
                  key={imgKey ?? idx}
                  className="relative group border border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-400 rounded-lg overflow-hidden transition-all"
                >
                  <div className="aspect-square relative">
                    <LazyRetryableImage
                      imageData={img as ImageFallbackUrls}
                      alt={imgKey}
                      className="w-full h-full object-cover rounded-lg"
                      preferredSize="thumb"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loading size="sm" text="Ładowanie więcej zdjęć..." />
            </div>
          )}
        </div>
      );
    }

    // For non-infinite scroll, use simple grid
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {imagesToRender.map((img, idx) => {
          const imgKey = img.key ?? img.filename ?? img.id ?? `img-${idx}`;
          return (
            <div
              key={imgKey ?? idx}
              className="relative group border border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-400 rounded-lg overflow-hidden transition-all"
            >
              <div className="aspect-square relative">
                <LazyRetryableImage
                  imageData={img as ImageFallbackUrls}
                  alt={imgKey}
                  className="w-full h-full object-cover rounded-lg"
                  preferredSize="thumb"
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Non-selection gallery: show all images
  if (shouldShowAllImages) {
    if (isLoading && images.length === 0) {
      return <GalleryLoading />;
    }
    return <div className="space-y-4">{renderImageGrid(images, false, true)}</div>;
  }

  // Selection gallery but no selectedKeys yet
  if (selectedKeys.length === 0) {
    // If order has a delivery status that suggests photos should exist, show all images as fallback
    const shouldShowFallback =
      (deliveryStatus === "CLIENT_APPROVED" ||
        deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
        deliveryStatus === "PREPARING_DELIVERY" ||
        deliveryStatus === "DELIVERED") &&
      images.length > 0;

    if (shouldShowFallback) {
      return (
        <div className="space-y-2">
          <div className="p-2 bg-info-50 border border-info-200 rounded-lg dark:bg-info-500/10 dark:border-info-500/20">
            <p className="text-xs text-info-800 dark:text-info-200">
              Uwaga: Zlecenie nie ma zapisanych wybranych kluczy. Wyświetlane są wszystkie zdjęcia.
            </p>
          </div>
          {renderImageGrid(images)}
        </div>
      );
    }

    return (
      <EmptyState
        icon={<HandHeart size={64} />}
        title="Brak wybranych zdjęć"
        description={
          deliveryStatus === "CLIENT_SELECTING"
            ? "Klient przegląda galerię i wybiera zdjęcia. Wybrane zdjęcia pojawią się tutaj po zakończeniu wyboru przez klienta."
            : "Klient nie wybrał jeszcze żadnych zdjęć. Po wyborze zdjęć przez klienta, wybrane zdjęcia pojawią się w tym miejscu."
        }
      />
    );
  }

  // Selection gallery with selectedKeys: show filtered images
  const normalizedSelectedKeys = selectedKeys.map((k) => k.toString().trim());
  const filteredImages = images.filter((img) => {
    const imgKey = (img.key ?? img.filename ?? img.id ?? "").toString().trim();
    return normalizedSelectedKeys.includes(imgKey);
  });

  if (isLoading && images.length === 0) {
    return <GalleryLoading />;
  }

  return (
    <div className="space-y-4">
      {renderImageGrid(filteredImages, true, true)}
    </div>
  );
}
