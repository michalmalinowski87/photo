import Button from "../ui/button/Button";
import { Loading } from "../ui/loading/Loading";
import { FileUploadZone } from "../upload/FileUploadZone";
import { StorageDisplay } from "../upload/StorageDisplay";
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

interface UploadProgress {
  current: number;
  total: number;
  currentFileName?: string;
  errors: unknown[];
  successes: number;
}

interface FinalsTabProps {
  images: GalleryImage[];
  gallery: Gallery | null;
  canUpload: boolean;
  isGalleryPaid: boolean;
  uploading: boolean;
  uploadProgress: UploadProgress;
  optimisticFinalsBytes: number | null;
  deletingImages: Set<string>;
  loading: boolean;
  onFileSelect: (files: FileList | null) => void;
  onCancelUpload: () => void;
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
  uploadProgress,
  optimisticFinalsBytes,
  deletingImages,
  loading,
  onFileSelect,
  onCancelUpload,
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

      {/* Upload Progress Bar */}
      {uploading && uploadProgress.total > 0 && (
        <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3 flex-1">
              <Loading size="sm" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Przesyłanie zdjęć finalnych...
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {uploadProgress.current} / {uploadProgress.total}
                  </span>
                </div>
                {uploadProgress.currentFileName && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {uploadProgress.currentFileName}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onCancelUpload}
              className="ml-4 px-3 py-1.5 text-sm font-medium text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300 border border-error-300 dark:border-error-700 rounded-md hover:bg-error-50 dark:hover:bg-error-900/20 transition-colors"
            >
              Anuluj
            </button>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-brand-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
              }}
            />
          </div>
          {uploadProgress.errors.length > 0 && (
            <div className="mt-2 text-xs text-error-600 dark:text-error-400">
              Błędy: {uploadProgress.errors.length} | Sukcesy: {uploadProgress.successes}
            </div>
          )}
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
          {gallery && gallery.finalsLimitBytes && (
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
                className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
              >
                <div className="aspect-square relative">
                  <RetryableImage
                    src={img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? ""}
                    alt={imageKey}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  {canUpload && (
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteImage(img);
                        }}
                        disabled={deletingImages.has(imageKey)}
                        className={`opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md ${
                          deletingImages.has(imageKey)
                            ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                            : "bg-error-500 text-white hover:bg-error-600"
                        }`}
                        title={deletingImages.has(imageKey) ? "Usuwanie..." : "Usuń zdjęcie"}
                      >
                        {deletingImages.has(imageKey) ? "Usuwanie..." : "Usuń"}
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

