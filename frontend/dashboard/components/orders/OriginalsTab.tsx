import { HandHeart } from "lucide-react";
import { useEffect, useCallback } from "react";

import { ImageFallbackUrls } from "../../lib/image-fallback";
import { DashboardVirtuosoGrid } from "../galleries/DashboardVirtuosoGrid";
import type { GridLayout } from "../galleries/LayoutSelector";
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
  layout?: GridLayout;
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
  layout = "standard",
}: OriginalsTabProps) {
  const shouldShowAllImages = !selectionEnabled;

  // Render image item for DashboardVirtuosoGrid
  const renderImageItem = useCallback(
    (img: GalleryImage, idx: number) => {
      const imgKey = img.key ?? img.filename ?? img.id ?? `img-${idx}`;
      const normalizedSelectedKeys = selectedKeys.map((k) => k.toString().trim());
      const isSelected = normalizedSelectedKeys.includes(imgKey.toString().trim());

      return (
        <div
          key={imgKey ?? idx}
          className={`relative group rounded-lg overflow-hidden transition-all ${
            isSelected
              ? "ring-2 ring-photographer-accentLight dark:ring-photographer-accent/30"
              : ""
          } ${
            layout === "square"
              ? "bg-gray-100 dark:bg-gray-800"
              : layout === "marble"
                ? "bg-white dark:bg-gray-800"
                : "bg-white dark:bg-gray-800"
          }`}
        >
          <div
            className={`relative w-full h-full ${
              layout === "square" ? "aspect-square" : layout === "marble" ? "" : "aspect-[4/3]"
            }`}
          >
            <LazyRetryableImage
              imageData={img as ImageFallbackUrls}
              alt={imgKey}
              className={`w-full h-full ${
                layout === "square"
                  ? "object-cover rounded-lg"
                  : layout === "marble"
                    ? "object-cover rounded-[2px]"
                    : "object-contain"
              }`}
              preferredSize={layout === "marble" ? "bigthumb" : "thumb"}
            />
          </div>
        </div>
      );
    },
    [selectedKeys, layout]
  );

  // Auto-fetch if we have selectedKeys and need to fetch more to match them
  useEffect(() => {
    if (
      selectedKeys.length > 0 &&
      images.length < selectedKeys.length &&
      hasNextPage &&
      fetchNextPage &&
      !isFetchingNextPage &&
      !error
    ) {
      const timeoutId = setTimeout(() => {
        if (hasNextPage && !isFetchingNextPage && !error && fetchNextPage) {
          void fetchNextPage();
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [images.length, selectedKeys.length, hasNextPage, fetchNextPage, isFetchingNextPage, error]);

  // Non-selection gallery: show all images
  if (shouldShowAllImages) {
    if (isLoading && images.length === 0) {
      return <GalleryLoading />;
    }
    return (
      <div
        className="w-full overflow-auto table-scrollbar"
        style={{ height: "calc(100vh - 400px)", minHeight: "600px", overscrollBehavior: "none" }}
      >
        <DashboardVirtuosoGrid
          images={images}
          layout={layout}
          renderImageItem={renderImageItem}
          hasNextPage={hasNextPage}
          onLoadMore={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoading={isLoading}
          error={error}
        />
      </div>
    );
  }

  // Selection gallery but no selectedKeys yet
  if (selectedKeys.length === 0) {
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
    <div
      className="w-full overflow-auto table-scrollbar"
      style={{ height: "calc(100vh - 400px)", minHeight: "600px", overscrollBehavior: "none" }}
    >
      <DashboardVirtuosoGrid
        images={filteredImages}
        layout={layout}
        renderImageItem={renderImageItem}
        hasNextPage={hasNextPage}
        onLoadMore={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
}
