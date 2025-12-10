import { HandHeart } from "lucide-react";

import { ImageFallbackUrls } from "../../lib/image-fallback";
import { EmptyState } from "../ui/empty-state/EmptyState";
import { LazyRetryableImage } from "../ui/LazyRetryableImage";
import { GalleryLoading } from "../ui/loading/Loading";

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

  // Helper to render image grid with infinite scroll support
  const renderImageGrid = (
    imagesToRender: GalleryImage[],
    highlightSelected = false,
    enableInfiniteScroll = false
  ) => {
    if (enableInfiniteScroll) {
      // For infinite scroll, wrap in scrollable container with prefetching
      return (
        <div
          className="w-full overflow-auto table-scrollbar"
          style={{ height: "calc(100vh - 400px)", minHeight: "600px", overscrollBehavior: "none" }}
          onScroll={(e) => {
            const target = e.target as HTMLElement;
            const scrollTop = target.scrollTop;
            const clientHeight = target.clientHeight;

            // Use item-based prefetching for smooth scrolling
            // Estimate item height based on grid layout (4 columns)
            // Average item height is approximately 200px (image + gap)
            const estimatedItemHeight = 200;
            const totalItemsRendered = imagesToRender.length;

            // Calculate which item index is currently at the bottom of viewport
            const scrollBottom = scrollTop + clientHeight;
            const itemsScrolled = Math.floor(scrollBottom / estimatedItemHeight);

            // Calculate distance from end (same logic as gallery photos)
            const distanceFromEnd = totalItemsRendered - itemsScrolled;
            const prefetchThreshold = 25; // Same threshold as other infinite scrolls

            // Don't fetch if there's an error or already fetching
            if (
              distanceFromEnd <= prefetchThreshold &&
              hasNextPage &&
              !isFetchingNextPage &&
              !error &&
              fetchNextPage
            ) {
              void fetchNextPage();
            }
          }}
        >
          <div className="grid grid-cols-4 gap-4 pb-4">
            {imagesToRender.map((img, idx) => {
              const imgKey = img.key ?? img.filename ?? img.id ?? `img-${idx}`;
              return (
                <div
                  key={imgKey ?? idx}
                  className={`relative ${
                    highlightSelected
                      ? "border-2 border-brand-500 ring-2 ring-brand-200"
                      : "border border-gray-200 dark:border-gray-700"
                  } rounded-lg overflow-hidden`}
                >
                  <LazyRetryableImage
                    imageData={img as ImageFallbackUrls}
                    alt={imgKey}
                    className="w-full h-48 object-cover"
                    preferredSize="thumb"
                  />
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
      <div className="grid grid-cols-4 gap-4">
        {imagesToRender.map((img, idx) => {
          const imgKey = img.key ?? img.filename ?? img.id ?? `img-${idx}`;
          return (
            <div
              key={imgKey ?? idx}
              className={`relative ${
                highlightSelected
                  ? "border-2 border-brand-500 ring-2 ring-brand-200"
                  : "border border-gray-200 dark:border-gray-700"
              } rounded-lg overflow-hidden`}
            >
              <LazyRetryableImage
                imageData={img as ImageFallbackUrls}
                alt={imgKey}
                className="w-full h-48 object-cover"
                preferredSize="thumb"
              />
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

  if (filteredImages.length === 0) {
    return (
      <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
        <p className="text-sm text-warning-800 dark:text-warning-200">
          Nie znaleziono zdjęć pasujących do wybranych kluczy. Wybrane klucze:{" "}
          {selectedKeys.slice(0, 5).join(", ")}
          {selectedKeys.length > 5 ? "..." : ""}
        </p>
        <p className="text-xs text-warning-600 dark:text-warning-400 mt-1">
          Dostępne zdjęcia: {images.length} | Wybrane klucze: {selectedKeys.length}
        </p>
      </div>
    );
  }

  return <div className="space-y-4">{renderImageGrid(filteredImages, true, true)}</div>;
}
