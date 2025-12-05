import { Plus, Trash2, Sparkles } from "lucide-react";

import { removeFileExtension } from "../../lib/filename-utils";
import { ImageFallbackUrls } from "../../lib/image-fallback";
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
  isGalleryPaid?: boolean;
  orderDeliveryStatus?: string;
  isNonSelectionGallery?: boolean;
}

export function FinalsTab({
  images,
  canUpload,
  deletingImages,
  onUploadClick,
  onDeleteImage,
  isGalleryPaid = true,
  orderDeliveryStatus,
  isNonSelectionGallery = false,
}: FinalsTabProps) {
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
      {canUpload && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button onClick={onUploadClick} variant="primary">
              <Plus className="w-5 h-5 mr-2" />
              Prześlij zdjęcia finalne
            </Button>
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
        <div className="grid grid-cols-4 gap-4">
          {images.map((img, idx) => {
            const imageKey = img.key ?? img.filename ?? "";

            return (
              <div
                key={imageKey ?? idx}
                className={`relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-colors ${
                  deletingImages.has(imageKey)
                    ? "opacity-60"
                    : "hover:border-brand-500 dark:hover:border-brand-400"
                }`}
              >
                <div className="aspect-square relative">
                  <LazyRetryableImage
                    imageData={img as ImageFallbackUrls}
                    alt={imageKey}
                    className="w-full h-full object-cover rounded-lg"
                    preferredSize="thumb"
                  />
                  {/* Deleting overlay - always visible when deleting */}
                  {deletingImages.has(imageKey) && (
                    <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center rounded-lg">
                      <div className="flex flex-col items-center space-y-2">
                        <Loading size="sm" />
                        <span className="text-white text-sm font-medium">Usuwanie...</span>
                      </div>
                    </div>
                  )}
                  {/* Delete button - show always when canUpload, disable when any deletion is in progress */}
                  {canUpload && !deletingImages.has(imageKey) && (
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
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
    </div>
  );
}
