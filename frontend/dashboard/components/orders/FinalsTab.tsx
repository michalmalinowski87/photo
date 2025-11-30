import Button from "../ui/button/Button";
import { Loading } from "../ui/loading/Loading";
import { RetryableImage } from "../ui/RetryableImage";
import { FileUploadZone } from "../upload/FileUploadZone";
import { StorageDisplay } from "../upload/StorageDisplay";

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
  uploading: boolean;
  optimisticFinalsBytes: number | null;
  deletingImages: Set<string>;
  loading: boolean;
  onFileSelect: (files: FileList | null) => void;
  onDeleteImage: (image: GalleryImage) => void;
  onPayClick: () => void;
  paymentLoading: boolean;
}

export function FinalsTab({
  images,
  gallery,
  canUpload,
  isGalleryPaid,
  uploading,
  optimisticFinalsBytes,
  deletingImages,
  loading,
  onFileSelect,
  onDeleteImage,
  onPayClick,
  paymentLoading,
}: FinalsTabProps) {
  return (
    <div className="space-y-4">
      {/* Show unpaid message if gallery is not paid */}
      {!isGalleryPaid && (
        <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
                Galeria nieopublikowana
              </div>
              <div className="text-xs text-warning-600 dark:text-warning-400">
                Nie możesz przesłać zdjęć finalnych, ponieważ galeria nie została opublikowana.
                Opublikuj galerię aby kontynuować.
              </div>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={onPayClick}
              disabled={paymentLoading}
            >
              {paymentLoading ? "Przetwarzanie..." : "Opublikuj galerię"}
            </Button>
          </div>
        </div>
      )}

      {canUpload && (
        <FileUploadZone
          onFileSelect={onFileSelect}
          uploading={uploading}
          accept="image/*"
          multiple={true}
        >
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
            aria-hidden="true"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="mt-4">
            <p className="text-base font-medium text-gray-900 dark:text-white">
              Przeciągnij zdjęcia tutaj lub kliknij, aby wybrać
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Obsługiwane formaty: JPG, PNG, GIF
            </p>
          </div>
          {gallery?.finalsLimitBytes && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <StorageDisplay
                bytesUsed={optimisticFinalsBytes ?? gallery.finalsBytesUsed ?? 0}
                limitBytes={gallery.finalsLimitBytes}
                label="Finalne"
                isLoading={optimisticFinalsBytes !== null && loading}
              />
            </div>
          )}
        </FileUploadZone>
      )}

      {images.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          Brak zdjęć finalnych
        </div>
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
                    src={img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? ""}
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
                  {/* Delete button - only show when not deleting */}
                  {canUpload && !deletingImages.has(imageKey) && (
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteImage(img);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md bg-error-500 text-white hover:bg-error-600"
                        title="Usuń zdjęcie"
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

