import { HandHeart, BookOpen, Image as ImageIcon } from "lucide-react";
import { useEffect, useCallback, useState, useMemo } from "react";

import { removeFileExtension } from "../../lib/filename-utils";
import { ImageFallbackUrls } from "../../lib/image-fallback";
import { DashboardVirtuosoGrid } from "../galleries/DashboardVirtuosoGrid";
import type { GridLayout } from "../galleries/LayoutSelector";
import { EmptyState } from "../ui/empty-state/EmptyState";
import { LazyRetryableImage } from "../ui/LazyRetryableImage";
import { GalleryLoading } from "../ui/loading/Loading";
import { PhotoNameOverlay } from "../ui/PhotoNameOverlay";
import { Tooltip } from "../ui/tooltip/Tooltip";

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

type PhotoFilter = "all" | "photoBook" | "photoPrint";

interface OriginalsTabProps {
  images: GalleryImage[];
  selectedKeys: string[];
  selectionEnabled: boolean;
  deliveryStatus?: string;
  galleryId?: string;
  isLoading?: boolean;
  error?: unknown;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  layout?: GridLayout;
  photoBookKeys?: string[];
  photoPrintKeys?: string[];
  showPhotoBookUi?: boolean;
  showPhotoPrintUi?: boolean;
}

export function OriginalsTab({
  images,
  selectedKeys,
  selectionEnabled,
  deliveryStatus,
  galleryId,
  isLoading = false,
  error,
  fetchNextPage,
  hasNextPage = false,
  isFetchingNextPage = false,
  layout = "standard",
  photoBookKeys = [],
  photoPrintKeys = [],
  showPhotoBookUi = false,
  showPhotoPrintUi = false,
}: OriginalsTabProps) {
  const shouldShowAllImages = !selectionEnabled;
  const showFilters = (showPhotoBookUi || showPhotoPrintUi) && selectedKeys.length > 0;
  const [filter, setFilter] = useState<PhotoFilter>("all");

  const photoBookSet = useMemo(
    () => new Set(photoBookKeys.map((k) => k.toString().trim())),
    [photoBookKeys]
  );
  const photoPrintSet = useMemo(
    () => new Set(photoPrintKeys.map((k) => k.toString().trim())),
    [photoPrintKeys]
  );

  // Render image item for DashboardVirtuosoGrid
  const renderImageItem = useCallback(
    (img: GalleryImage, idx: number) => {
      const imgKey = (img.key ?? img.filename ?? img.id ?? `img-${idx}`).toString().trim();
      const inBook = photoBookSet.has(imgKey);
      const inPrint = photoPrintSet.has(imgKey);

      return (
        <div
          key={imgKey ?? idx}
          className={`relative group w-full h-full rounded-lg overflow-hidden transition-all ${
            layout === "square"
              ? "bg-gray-100 dark:bg-gray-800"
              : layout === "marble"
                ? "bg-white dark:bg-gray-800"
                : "bg-white dark:bg-gray-800"
          }`}
        >
          <div
            className={`relative overflow-hidden w-full h-full ${
              layout === "square" ? "aspect-square" : layout === "marble" ? "" : "aspect-[4/3]"
            }`}
          >
            <LazyRetryableImage
              imageData={img as ImageFallbackUrls}
              alt={String(imgKey)}
              galleryId={galleryId}
              className={`w-full h-full ${
                layout === "square"
                  ? "object-cover rounded-lg"
                  : layout === "marble"
                    ? "object-cover rounded-[2px]"
                    : "object-contain"
              }`}
              preferredSize={layout === "marble" ? "bigthumb" : "thumb"}
            />
            <PhotoNameOverlay displayName={removeFileExtension(img.key ?? img.filename ?? "")} />
            {showFilters && (inBook || inPrint) && (
              <div className="absolute top-2 right-2 flex flex-row gap-1 items-center z-10">
                {showPhotoBookUi && inBook && (
                  <Tooltip content="Album" side="bottom">
                    <span
                      className="w-7 h-7 rounded inline-flex items-center justify-center bg-gray-900/70 text-white shrink-0"
                      aria-hidden
                    >
                      <BookOpen className="w-4 h-4" strokeWidth={2} />
                    </span>
                  </Tooltip>
                )}
                {showPhotoPrintUi && inPrint && (
                  <Tooltip content="Druk" side="bottom">
                    <span
                      className="w-7 h-7 rounded inline-flex items-center justify-center bg-gray-900/70 text-white shrink-0"
                      aria-hidden
                    >
                      <ImageIcon className="w-4 h-4" strokeWidth={2} />
                    </span>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </div>
      );
    },
    [layout, showFilters, showPhotoBookUi, showPhotoPrintUi, photoBookSet, photoPrintSet, galleryId]
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
  let baseFiltered = images.filter((img) => {
    const imgKey = (img.key ?? img.filename ?? img.id ?? "").toString().trim();
    return normalizedSelectedKeys.includes(imgKey);
  });

  // Apply photo book / photo print filter when active
  if (showFilters && filter !== "all") {
    const keySet = filter === "photoBook" ? photoBookSet : photoPrintSet;
    baseFiltered = baseFiltered.filter((img) => {
      const imgKey = (img.key ?? img.filename ?? img.id ?? "").toString().trim();
      return keySet.has(imgKey);
    });
  }

  if (isLoading && images.length === 0) {
    return <GalleryLoading />;
  }

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-photographer-accent text-white dark:bg-photographer-accentDark"
                : "bg-photographer-elevated dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-photographer-muted dark:hover:bg-gray-700"
            }`}
          >
            Wszystkie ({selectedKeys.length})
          </button>
          {showPhotoBookUi && (
            <button
              type="button"
              onClick={() => setFilter("photoBook")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === "photoBook"
                  ? "bg-photographer-accent text-white dark:bg-photographer-accentDark"
                  : "bg-photographer-elevated dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-photographer-muted dark:hover:bg-gray-700"
              }`}
            >
              Album ({photoBookKeys.length})
            </button>
          )}
          {showPhotoPrintUi && (
            <button
              type="button"
              onClick={() => setFilter("photoPrint")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === "photoPrint"
                  ? "bg-photographer-accent text-white dark:bg-photographer-accentDark"
                  : "bg-photographer-elevated dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-photographer-muted dark:hover:bg-gray-700"
              }`}
            >
              Druk ({photoPrintKeys.length})
            </button>
          )}
        </div>
      )}
      <div
        className="w-full overflow-auto table-scrollbar"
        style={{ height: "calc(100vh - 400px)", minHeight: "600px", overscrollBehavior: "none" }}
      >
        <DashboardVirtuosoGrid
          images={baseFiltered}
          layout={layout}
          renderImageItem={renderImageItem}
          hasNextPage={hasNextPage}
          onLoadMore={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoading={isLoading}
          error={error}
        />
      </div>
    </div>
  );
}
