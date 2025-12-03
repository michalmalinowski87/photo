import Button from "../ui/button/Button";
import { Loading } from "../ui/loading/Loading";
import { RetryableImage } from "../ui/RetryableImage";

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

interface Gallery {
  finalsLimitBytes?: number;
  finalsBytesUsed?: number;
  [key: string]: unknown;
}

interface FinalsTabProps {
  images: GalleryImage[];
  gallery: Gallery | null;
  canUpload: boolean;
  isGalleryPaid: boolean;
  optimisticFinalsBytes: number | null;
  deletingImages: Set<string>;
  loading: boolean;
  onUploadClick: () => void;
  onDeleteImage: (image: GalleryImage) => void;
  onPayClick: () => void;
  paymentLoading: boolean;
  isNonSelectionGallery?: boolean;
  orderDeliveryStatus?: string;
}

export function FinalsTab({
  images,
  gallery,
  canUpload,
  isGalleryPaid,
  optimisticFinalsBytes,
  deletingImages,
  loading,
  onUploadClick,
  onDeleteImage,
  onPayClick,
  paymentLoading,
  isNonSelectionGallery = false,
  orderDeliveryStatus,
}: FinalsTabProps) {
  // For non-selection galleries, show publish button when status is AWAITING_FINAL_PHOTOS and gallery is not paid
  const shouldShowPublishButton =
    isNonSelectionGallery &&
    orderDeliveryStatus === "AWAITING_FINAL_PHOTOS" &&
    !isGalleryPaid;

  return (
    <div className="space-y-4">
      {/* Show publish button for non-selection galleries when appropriate */}
      {shouldShowPublishButton && (
        <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
                Opublikuj galerię
              </div>
              <div className="text-xs text-warning-600 dark:text-warning-400">
                Opublikuj galerię aby kontynuować z procesem.
              </div>
            </div>
            <Button size="sm" variant="primary" onClick={onPayClick} disabled={paymentLoading}>
              {paymentLoading ? "Przetwarzanie..." : "Opublikuj galerię"}
            </Button>
          </div>
        </div>
      )}

      {canUpload && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button onClick={onUploadClick} variant="primary">
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Prześlij zdjęcia finalne
            </Button>
          </div>
        </div>
      )}

      {images.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">Brak zdjęć finalnych</div>
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
                  <RetryableImage
                    // Image loading priority: CloudFront thumb → CloudFront preview → S3 full (last resort only)
                    // We NEVER fetch full S3 images if thumbnails/previews are available
                    // This reduces bandwidth and improves performance
                    src={img.thumbUrl ?? img.previewUrl ?? img.finalUrl ?? img.url ?? ""}
                    alt={imageKey}
                    className="w-full h-full object-cover rounded-lg"
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
                        className={`opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md ${
                          deletingImages.size > 0
                            ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                            : "bg-error-500 text-white hover:bg-error-600"
                        }`}
                      >
                        Usuń
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{imageKey}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
