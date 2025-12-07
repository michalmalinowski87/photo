import { Plus, Trash2, Sparkles, CheckSquare, Square, Check, X } from "lucide-react";
import { useState, useCallback, useEffect } from "react";

import { BulkDeleteConfirmDialog } from "../dialogs/BulkDeleteConfirmDialog";
import { removeFileExtension } from "../../lib/filename-utils";
import { ImageFallbackUrls } from "../../lib/image-fallback";
import { useImageSelection } from "../../hooks/useImageSelection";
import Button from "../ui/button/Button";
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
    storageKey: `final_image_selection_${galleryId || "default"}_${orderId || "default"}`,
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
      if ((event.key === "Delete" || event.key === "Backspace") && selectedKeys.size > 0 && onDeleteImagesBatch) {
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
  }, [isSelectionMode, selectedKeys, images, selectAll, toggleSelectionMode, handleBulkDeleteClick, onDeleteImagesBatch]);
  // Determine why upload is disabled and show appropriate message
  const getUploadDisabledMessage = (): string | null => {
    if (canUpload) {
      return null;
    }

    if (!isGalleryPaid) {
      return "Aby przesłać zdjęcia finalne, galeria musi być opublikowana.";
    }

    if (orderDeliveryStatus === "CANCELLED") {
      return "Nie można przesłać zdjęć finalnych dla anulowanego zlecenia.";
    }

    if (isNonSelectionGallery) {
      // For non-selection galleries, uploads are allowed when order is in specific statuses
      // If we get here and gallery is paid, it means order status is not in the allowed list
      return "Aby przesłać zdjęcia finalne, zlecenie musi być w statusie oczekiwania na zdjęcia finalne (AWAITING_FINAL_PHOTOS) lub przygotowania do dostawy. Sprawdź status zlecenia i poczekaj na odpowiedni moment w procesie.";
    }

    return "Aby przesłać zdjęcia finalne, zlecenie musi być w odpowiednim statusie (zatwierdzone przez klienta lub przygotowywane do dostawy).";
  };

  const uploadDisabledMessage = getUploadDisabledMessage();

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isSelectionMode && (
          <>
            {canUpload && (
              <Button onClick={onUploadClick} variant="primary">
                <Plus className="w-5 h-5 mr-2" />
                Prześlij zdjęcia finalne
              </Button>
            )}
            {images.length > 0 && (
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
            <span className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg flex items-center gap-2 justify-center" style={{ width: "165.81px" }}>
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
          </>
        )}
      </div>

      {/* Bulk Action Toolbar - Show immediately when selection mode is active */}
      {isSelectionMode && (
        <div className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm -mx-6 px-6 py-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
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
            {onDeleteImagesBatch && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBulkDeleteClick}
                  disabled={isBulkDeleting || selectedKeys.size === 0}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={18} />
                  Usuń {selectedKeys.size > 0 && `(${selectedKeys.size})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
        <div className={`grid grid-cols-4 gap-4 ${isSelectionMode ? "select-none" : ""}`}>
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
                  // Prevent browser text/element selection on SHIFT+click
                  if (isSelectionMode && (e.shiftKey || e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                  }
                }}
                onSelectStart={(e) => {
                  // Prevent text selection when in selection mode
                  if (isSelectionMode) {
                    e.preventDefault();
                  }
                }}
                onClick={(e) => {
                  if (isSelectionMode) {
                    handleSelectionClick(imageKey, idx, e.nativeEvent as MouseEvent, images);
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
                          handleSelectionClick(imageKey, idx, e.nativeEvent as MouseEvent, images);
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
                  {/* Delete button - show always when canUpload, disable when any deletion is in progress */}
                  {canUpload && !isDeleting && !isSelectionMode && (
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
                <div className="p-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate" title={imageKey}>
                    {removeFileExtension(imageKey)}
                  </p>
                </div>
              </div>
            );
          })}
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
