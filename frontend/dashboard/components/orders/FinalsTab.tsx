import {
  Plus,
  Trash2,
  Sparkles,
  CheckSquare,
  Square,
  Check,
  X,
  BookOpen,
  Image as ImageIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useMemo } from "react";

import { useImageSelection } from "../../hooks/useImageSelection";
import { removeFileExtension } from "../../lib/filename-utils";
import { ImageFallbackUrls } from "../../lib/image-fallback";
import { DashboardVirtuosoGrid } from "../galleries/DashboardVirtuosoGrid";
import type { GridLayout } from "../galleries/LayoutSelector";
import { EmptyState } from "../ui/empty-state/EmptyState";
import { LazyRetryableImage } from "../ui/LazyRetryableImage";
import { Loading } from "../ui/loading/Loading";
import { PhotoNameOverlay } from "../ui/PhotoNameOverlay";
import { Tooltip } from "../ui/tooltip/Tooltip";

interface GalleryImage {
  id?: string;
  key?: string;
  filename?: string;
  url?: string;
  thumbUrl?: string;
  previewUrl?: string;
  finalUrl?: string;
  size?: number;
  [key: string]: unknown;
}

type PhotoFilter = "all" | "photoBook" | "photoPrint";

interface FinalsTabProps {
  images: GalleryImage[];
  canUpload: boolean;
  deletingImages: Set<string>;
  onUploadClick: () => void;
  onDeleteImage: (image: GalleryImage) => void;
  onDeleteImagesBatch?: (imageKeys: string[]) => Promise<void>;
  isGalleryPaid?: boolean;
  orderDeliveryStatus?: string;
  isNonSelectionGallery?: boolean;
  galleryId?: string;
  orderId?: string;
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

// Lazy load BulkDeleteConfirmDialog - only shown when bulk delete confirmation is open
const BulkDeleteConfirmDialog = dynamic(
  () =>
    import("../dialogs/BulkDeleteConfirmDialog").then((mod) => ({
      default: mod.BulkDeleteConfirmDialog,
    })),
  {
    ssr: false,
  }
);

export function FinalsTab({
  images,
  canUpload,
  deletingImages,
  onUploadClick,
  onDeleteImage,
  onDeleteImagesBatch,
  isGalleryPaid = true,
  orderDeliveryStatus,
  isNonSelectionGallery = false,
  galleryId,
  orderId,
  isLoading: _isLoading = false,
  error,
  fetchNextPage,
  hasNextPage = false,
  isFetchingNextPage = false,
  layout = "standard",
  photoBookKeys = [],
  photoPrintKeys = [],
  showPhotoBookUi = false,
  showPhotoPrintUi = false,
}: FinalsTabProps) {
  const showFilters = (showPhotoBookUi || showPhotoPrintUi) && images.length > 0;
  const [filter, setFilter] = useState<PhotoFilter>("all");

  const photoBookSet = useMemo(
    () => new Set(photoBookKeys.map((k) => k.toString().trim())),
    [photoBookKeys]
  );
  const photoPrintSet = useMemo(
    () => new Set(photoPrintKeys.map((k) => k.toString().trim())),
    [photoPrintKeys]
  );

  const displayedImages = useMemo(() => {
    if (!showFilters || filter === "all") return images;
    const keySet = filter === "photoBook" ? photoBookSet : photoPrintSet;
    return images.filter((img) => {
      const k = (img.key ?? img.filename ?? img.id ?? "").toString().trim();
      return keySet.has(k);
    });
  }, [images, showFilters, filter, photoBookSet, photoPrintSet]);

  // Selection mode for bulk delete
  const {
    selectedKeys,
    isSelectionMode,
    toggleSelectionMode,
    handleImageClick: handleSelectionClick,
    selectAll,
    deselectAll,
    clearSelection,
  } = useImageSelection({
    storageKey: `final_image_selection_${galleryId ?? "default"}_${orderId ?? "default"}`,
  });

  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedKeys.size === 0 || !onDeleteImagesBatch) {
      return;
    }
    setBulkDeleteConfirmOpen(true);
  }, [selectedKeys, onDeleteImagesBatch]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (selectedKeys.size === 0 || !onDeleteImagesBatch) {
      setBulkDeleteConfirmOpen(false);
      return;
    }

    setIsBulkDeleting(true);
    try {
      await onDeleteImagesBatch(Array.from(selectedKeys));
      setBulkDeleteConfirmOpen(false);
      clearSelection();
      toggleSelectionMode();
    } catch (_error) {
      // Error handling should be done by parent
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedKeys, onDeleteImagesBatch, clearSelection, toggleSelectionMode]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isSelectionMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + A: Select all
      if ((event.ctrlKey || event.metaKey) && event.key === "a") {
        event.preventDefault();
        if (images.length > 0) {
          selectAll(images);
        }
        return;
      }

      // Delete or Backspace: Delete selected
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedKeys.size > 0 &&
        onDeleteImagesBatch
      ) {
        event.preventDefault();
        handleBulkDeleteClick();
        return;
      }

      // Escape: Exit selection mode
      if (event.key === "Escape") {
        event.preventDefault();
        toggleSelectionMode();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isSelectionMode,
    selectedKeys,
    images,
    selectAll,
    toggleSelectionMode,
    handleBulkDeleteClick,
    onDeleteImagesBatch,
  ]);
  // Determine why upload is disabled and show appropriate message
  const getUploadDisabledMessage = (): string | null => {
    if (canUpload) {
      return null;
    }

    // For selective galleries, require payment
    if (!isNonSelectionGallery && !isGalleryPaid) {
      return "Aby przesłać zdjęcia finalne, galeria musi być opublikowana.";
    }

    if (orderDeliveryStatus === "CANCELLED") {
      return "Nie można przesłać zdjęć finalnych dla anulowanego zlecenia.";
    }

    if (isNonSelectionGallery) {
      // For non-selection galleries, uploads are allowed even when unpublished
      // If we get here, it means order status is not in the allowed list
      return "Aby przesłać zdjęcia finalne, zlecenie musi być w statusie oczekiwania na zdjęcia finalne (AWAITING_FINAL_PHOTOS) lub przygotowania do dostawy. Sprawdź status zlecenia i poczekaj na odpowiedni moment w procesie.";
    }

    return "Aby przesłać zdjęcia finalne, zlecenie musi być w odpowiednim statusie (zatwierdzone przez klienta lub przygotowywane do dostawy).";
  };

  const uploadDisabledMessage = getUploadDisabledMessage();

  // Render image item for DashboardVirtuosoGrid
  const renderImageItem = useCallback(
    (img: GalleryImage, idx: number) => {
      const imageKey = (img.key ?? img.filename ?? "").toString().trim();
      const isSelected = selectedKeys.has(imageKey);
      const isDeleting = deletingImages.has(imageKey);
      const inBook = photoBookSet.has(imageKey);
      const inPrint = photoPrintSet.has(imageKey);

      return (
        <div
          key={imageKey ?? idx}
          className={`relative group w-full h-full rounded-lg overflow-hidden transition-all ${
            isSelectionMode ? "select-none" : ""
          } ${
            isDeleting
              ? "opacity-60"
              : isSelected && isSelectionMode
                ? "ring-2 ring-photographer-accentLight dark:ring-photographer-accent/30"
                : ""
          } ${
            layout === "square"
              ? "bg-gray-100 dark:bg-gray-800"
              : layout === "marble"
                ? "bg-white dark:bg-gray-800"
                : "bg-white dark:bg-gray-800"
          }`}
          onMouseDown={(e) => {
            if (isSelectionMode) {
              e.preventDefault();
            }
          }}
          onClick={(e) => {
            if (isSelectionMode) {
              handleSelectionClick(imageKey, idx, e.nativeEvent, displayedImages);
            }
          }}
        >
          <div
            className={`relative overflow-hidden w-full h-full ${
              layout === "square" ? "aspect-square" : layout === "marble" ? "" : "aspect-[4/3]"
            }`}
          >
            {isSelectionMode && (
              <div className="absolute top-2 left-2 z-30">
                <div
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-photographer-accentHover border-photographer-accentHover dark:bg-photographer-accent dark:border-photographer-accent"
                      : "bg-white/90 border-gray-400 dark:bg-gray-800/90 dark:border-gray-600"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectionClick(imageKey, idx, e.nativeEvent, displayedImages);
                  }}
                >
                  {isSelected && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </div>
              </div>
            )}

            <LazyRetryableImage
              imageData={img as ImageFallbackUrls}
              alt={imageKey}
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
            {isDeleting && (
              <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center rounded-lg z-30">
                <div className="flex flex-col items-center space-y-2">
                  <Loading size="sm" />
                  <span className="text-white text-sm font-medium">Usuwanie...</span>
                </div>
              </div>
            )}
            {onDeleteImage &&
              !isDeleting &&
              !isSelectionMode &&
              orderDeliveryStatus !== "DELIVERED" && (
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center z-20">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteImage(img);
                    }}
                    disabled={deletingImages.size > 0}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-1.5 ${
                      deletingImages.size > 0
                        ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                        : "bg-error-500 text-white hover:bg-error-600"
                    }`}
                  >
                    <Trash2 size={14} />
                    Usuń
                  </button>
                </div>
              )}
          </div>
        </div>
      );
    },
    [
      selectedKeys,
      isSelectionMode,
      deletingImages,
      layout,
      handleSelectionClick,
      displayedImages,
      onDeleteImage,
      orderDeliveryStatus,
      showFilters,
      showPhotoBookUi,
      showPhotoPrintUi,
      photoBookSet,
      photoPrintSet,
    ]
  );

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isSelectionMode && (
          <>
            {canUpload && (
              <button
                onClick={onUploadClick}
                className="px-4 py-2 bg-photographer-accent hover:bg-photographer-accentHover text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus size={20} />
                Prześlij zdjęcia finalne
              </button>
            )}
            {images.length > 0 && orderDeliveryStatus !== "DELIVERED" && (
              <button
                onClick={toggleSelectionMode}
                className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-photographer-muted text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                <Square size={20} />
                Wybierz zdjęcia
              </button>
            )}
          </>
        )}
        {isSelectionMode && (
          <>
            <span
              className="px-4 py-2 bg-photographer-elevated dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg flex items-center gap-2 justify-center"
              style={{ width: "165.81px" }}
            >
              <CheckSquare size={20} />
              Tryb wyboru
            </span>
            <button
              onClick={() => {
                toggleSelectionMode();
                clearSelection();
              }}
              className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-photographer-muted text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 justify-center"
              style={{ width: "171.9px" }}
            >
              <X size={20} />
              Anuluj
            </button>
            <div className="flex items-center gap-4 ml-auto">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {selectedKeys.size === 0
                  ? "0 zdjęć wybranych"
                  : selectedKeys.size === 1
                    ? "1 zdjęcie wybrane"
                    : selectedKeys.size < 5
                      ? `${selectedKeys.size} zdjęcia wybrane`
                      : `${selectedKeys.size} zdjęć wybranych`}
              </span>
              {(() => {
                const list = displayedImages;
                const allSelected = list.length > 0 && selectedKeys.size === list.length;
                return (
                  <>
                    <button
                      onClick={() => {
                        if (allSelected) {
                          deselectAll();
                        } else {
                          selectAll(list);
                        }
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {allSelected ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
                    </button>
                    {selectedKeys.size > 0 && (
                      <button
                        onClick={clearSelection}
                        className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Anuluj wybór
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
            {onDeleteImagesBatch && orderDeliveryStatus !== "DELIVERED" && (
              <button
                onClick={handleBulkDeleteClick}
                disabled={isBulkDeleting || selectedKeys.size === 0}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={18} />
                Usuń {selectedKeys.size > 0 && `(${selectedKeys.size})`}
              </button>
            )}
          </>
        )}
      </div>

      {images.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={64} />}
          title="Brak zdjęć finalnych"
          description={
            canUpload
              ? "Prześlij zdjęcia finalne dla tego zlecenia. Zdjęcia finalne to wersje gotowe do dostarczenia klientowi."
              : (uploadDisabledMessage ?? "Nie można przesłać zdjęć finalnych w tym momencie.")
          }
          actionButton={
            canUpload
              ? {
                  label: "Prześlij zdjęcia finalne",
                  onClick: onUploadClick,
                  icon: <Plus size={18} />,
                }
              : undefined
          }
        />
      ) : (
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
                Wszystkie ({images.length})
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
            className={`w-full overflow-auto table-scrollbar ${isSelectionMode ? "select-none" : ""}`}
            style={{
              height: "calc(100vh - 470px)",
              minHeight: "600px",
              overscrollBehavior: "none",
            }}
          >
            <DashboardVirtuosoGrid
              images={displayedImages}
              layout={layout}
              renderImageItem={renderImageItem}
              hasNextPage={hasNextPage}
              onLoadMore={fetchNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isLoading={_isLoading}
              error={error}
            />
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {onDeleteImagesBatch && (
        <BulkDeleteConfirmDialog
          isOpen={bulkDeleteConfirmOpen}
          onClose={() => {
            if (!isBulkDeleting) {
              setBulkDeleteConfirmOpen(false);
            }
          }}
          onConfirm={handleBulkDeleteConfirm}
          count={selectedKeys.size}
          loading={isBulkDeleting}
        />
      )}
    </div>
  );
}
