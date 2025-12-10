import { Plus, Trash2, Sparkles, CheckSquare, Square, Check, X } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";

import { useImageSelection } from "../../hooks/useImageSelection";
import { ImageFallbackUrls } from "../../lib/image-fallback";
import { BulkDeleteConfirmDialog } from "../dialogs/BulkDeleteConfirmDialog";
import { EmptyState } from "../ui/empty-state/EmptyState";
import { LazyRetryableImage } from "../ui/LazyRetryableImage";
import { Loading } from "../ui/loading/Loading";

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
}

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
}: FinalsTabProps) {
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
    } catch (error) {
      // Error handling should be done by parent
      console.error("Bulk delete failed:", error);
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
  useEffect(() => {
    if (!scrollContainerRef.current || isFetchingNextPage || error || images.length === 0 || !fetchNextPage) {
      return;
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
      return;
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
    
    return undefined;
  }, [images.length, hasNextPage, isFetchingNextPage, error, fetchNextPage]);

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isSelectionMode && (
          <>
            {canUpload && (
              <button
                onClick={onUploadClick}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus size={20} />
                Prześlij zdjęcia finalne
              </button>
            )}
            {images.length > 0 && orderDeliveryStatus !== "DELIVERED" && (
              <button
                onClick={toggleSelectionMode}
                className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
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
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg flex items-center gap-2 justify-center"
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
              className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 justify-center"
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
                const allSelected = images.length > 0 && selectedKeys.size === images.length;
                return (
                  <>
                    <button
                      onClick={() => {
                        if (allSelected) {
                          deselectAll();
                        } else {
                          selectAll(images);
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
        <div
          ref={scrollContainerRef}
          className={`w-full overflow-auto table-scrollbar ${isSelectionMode ? "select-none" : ""}`}
          style={{ height: "calc(100vh - 470px)", minHeight: "600px", overscrollBehavior: "none" }}
          onScroll={(e) => {
            const target = e.target as HTMLElement;
            const scrollTop = target.scrollTop;
            const scrollHeight = target.scrollHeight;
            const clientHeight = target.clientHeight;

            // Use scrollHeight-based calculation for more reliable bottom detection
            // This ensures we detect when we're near the bottom regardless of item count
            const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
            const threshold = 200; // Fetch when within 200px of bottom

            // Don't fetch if there's an error or already fetching
            if (
              distanceFromBottom <= threshold &&
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
            className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-8 ${isSelectionMode ? "select-none" : ""}`}
          >
            {images.map((img, idx) => {
              const imageKey = img.key ?? img.filename ?? "";
              const isSelected = selectedKeys.has(imageKey);
              const isDeleting = deletingImages.has(imageKey);

              return (
                <div
                  key={imageKey ?? idx}
                  className={`relative group border rounded-lg overflow-hidden transition-all ${
                    isSelectionMode ? "select-none" : ""
                  } ${
                    isDeleting
                      ? "opacity-60"
                      : isSelected && isSelectionMode
                        ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-800"
                        : "border-gray-200 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-400"
                  }`}
                  onMouseDown={(e) => {
                    // Prevent browser text/element selection when in selection mode
                    if (isSelectionMode) {
                      e.preventDefault();
                    }
                  }}
                  onClick={(e) => {
                    if (isSelectionMode) {
                      handleSelectionClick(imageKey, idx, e.nativeEvent, images);
                    }
                  }}
                >
                  <div className="aspect-square relative">
                    {/* Selection checkbox overlay */}
                    {isSelectionMode && (
                      <div className="absolute top-2 left-2 z-30">
                        <div
                          className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-brand-600 border-brand-600 dark:bg-brand-500 dark:border-brand-500"
                              : "bg-white/90 border-gray-300 dark:bg-gray-800/90 dark:border-gray-600"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectionClick(imageKey, idx, e.nativeEvent, images);
                          }}
                        >
                          {isSelected && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                        </div>
                      </div>
                    )}

                    <LazyRetryableImage
                      imageData={img as ImageFallbackUrls}
                      alt={imageKey}
                      className="w-full h-full object-cover rounded-lg"
                      preferredSize="thumb"
                    />
                    {/* Deleting overlay - always visible when deleting */}
                    {isDeleting && (
                      <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center rounded-lg z-30">
                        <div className="flex flex-col items-center space-y-2">
                          <Loading size="sm" />
                          <span className="text-white text-sm font-medium">Usuwanie...</span>
                        </div>
                      </div>
                    )}
                    {/* Delete button - show when onDeleteImage is provided, hide when order is DELIVERED, disable when any deletion is in progress */}
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
            })}
          </div>
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loading size="sm" text="Ładowanie więcej zdjęć..." />
            </div>
          )}
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
