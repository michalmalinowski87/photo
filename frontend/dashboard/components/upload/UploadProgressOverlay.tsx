import React, { useMemo, useState } from "react";

export interface PerImageProgress {
  fileName: string;
  status: "uploading" | "processing" | "ready" | "error";
  uploadProgress?: number; // 0-100 for upload progress
  error?: string;
}

interface ImageProgressItemProps {
  image: PerImageProgress;
  compact?: boolean;
  isProcessing?: boolean; // True if we're in processing phase (upload complete)
}

const ImageProgressItem: React.FC<ImageProgressItemProps> = ({
  image,
  compact = false,
  isProcessing = false,
}) => {
  return (
    <div
      className={`${compact ? "py-1" : "py-2"} border-b border-gray-100 dark:border-gray-700/50 last:border-b-0`}
    >
      <div className="flex items-center gap-2">
        {/* Status indicator - simplified */}
        <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {image.status === "ready" && (
            <svg
              className="w-3 h-3 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
          {image.status === "error" && (
            <svg
              className="w-3 h-3 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
          {(image.status === "uploading" || image.status === "processing") && (
            <div className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p
            className={`${compact ? "text-xs" : "text-sm"} font-medium text-gray-900 dark:text-white truncate`}
          >
            {image.fileName}
          </p>
          {!compact && (
            <>
              {/* Progress bar */}
              {image.status === "uploading" && image.uploadProgress !== undefined && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-1">
                  <div
                    className="bg-brand-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(image.uploadProgress, 50)}%` }}
                  />
                </div>
              )}

              {image.status === "processing" && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-1 overflow-hidden">
                  <div
                    className="bg-blue-500 h-1 rounded-full animate-pulse"
                    style={{ width: isProcessing ? "100%" : "60%" }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Progress percentage */}
        {image.status === "uploading" && image.uploadProgress !== undefined && !compact && (
          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
            {Math.round(image.uploadProgress)}%
          </span>
        )}
      </div>
    </div>
  );
};

interface UploadProgressOverlayProps {
  images: PerImageProgress[];
  onDismiss?: () => void;
  isUploadComplete?: boolean; // Whether upload phase is complete (now processing)
}

export const UploadProgressOverlay: React.FC<UploadProgressOverlayProps> = ({
  images,
  onDismiss,
  isUploadComplete = false,
}) => {
  const [showCompleted, setShowCompleted] = useState(false);
  const [showErrors, setShowErrors] = useState(true);
  const maxUploadItems = 5; // Show up to 5 items with upload progress bars

  // Separate images by status - hooks must be called unconditionally
  const uploadingImages = useMemo(() => {
    if (images.length === 0) {
      return [];
    }
    // Show first 5 items that are uploading (with progress bars)
    return images.filter((img) => img.status === "uploading").slice(0, maxUploadItems);
  }, [images, maxUploadItems]);

  const processingCount = useMemo(() => {
    if (images.length === 0) {
      return 0;
    }
    // Count all items in processing (no individual bars, just counter)
    return images.filter((img) => img.status === "processing").length;
  }, [images]);

  const completedImages = useMemo(() => {
    if (images.length === 0) {
      return [];
    }
    return images.filter((img) => img.status === "ready");
  }, [images]);

  const errorImages = useMemo(() => {
    if (images.length === 0) {
      return [];
    }
    return images.filter((img) => img.status === "error");
  }, [images]);

  if (images.length === 0) {
    return null;
  }

  const readyCount = completedImages.length;
  const errorCount = errorImages.length;
  const total = images.length;
  const allComplete = readyCount + errorCount === total;

  // Calculate overall progress
  // During upload: show 50% max, after upload complete: show 100% (processing phase)
  const uploadProgress = total > 0 ? Math.round(((readyCount + errorCount) / total) * 50) : 0;
  const overallProgress = isUploadComplete ? 100 : Math.min(uploadProgress, 50);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {allComplete ? (
              <svg
                className="w-5 h-5 text-green-500 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {allComplete
                  ? "Przesyłanie zakończone"
                  : isUploadComplete
                    ? "Przetwarzanie zdjęć"
                    : "Przesyłanie zdjęć"}
              </h3>
              {!allComplete && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {uploadingImages.length > 0 && `Przesyłanie: ${uploadingImages.length}`}
                  {uploadingImages.length > 0 && processingCount > 0 && " • "}
                  {processingCount > 0 && `Przetwarzanie: ${processingCount}`}
                  {uploadingImages.length === 0 &&
                    processingCount === 0 &&
                    `${readyCount + errorCount} / ${total} przesłanych`}
                </p>
              )}
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0 ml-2"
              aria-label="Zamknij"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Overall progress bar */}
        {!allComplete && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  isUploadComplete ? "bg-blue-500" : "bg-brand-500"
                }`}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            {isUploadComplete && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Przesyłanie zakończone, przetwarzanie zdjęć...
              </p>
            )}
          </div>
        )}

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          {/* Uploading items - show progress bars */}
          {uploadingImages.length > 0 && (
            <div className="px-4 py-2">
              <div className="space-y-1">
                {uploadingImages.map((image, index) => (
                  <ImageProgressItem key={`uploading-${image.fileName}-${index}`} image={image} />
                ))}
              </div>
            </div>
          )}

          {/* Processing counter - no individual bars */}
          {processingCount > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 flex items-center justify-center">
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Przetwarzanie: <span className="font-medium">{processingCount}</span> zdjęć
                </p>
              </div>
            </div>
          )}

          {/* Errors section - show at top, always expanded */}
          {errorCount > 0 && (
            <div className="px-4 py-2 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400">
                  <svg
                    className="w-4 h-4 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Błędy ({errorCount})
                </span>
                <button
                  onClick={() => setShowErrors(!showErrors)}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${showErrors ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
              {showErrors && (
                <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                  {errorImages.map((image, index) => (
                    <div
                      key={`error-${image.fileName}-${index}`}
                      className="bg-white dark:bg-gray-800 rounded p-2 border border-red-200 dark:border-red-800"
                    >
                      <div className="flex items-start gap-2">
                        <svg
                          className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {image.fileName}
                          </p>
                          {image.error && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-words">
                              {image.error.length > 150
                                ? `${image.error.substring(0, 150)}...`
                                : image.error}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completed summary - always collapsed, expandable, show ALL items */}
          {completedImages.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="w-full flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg
                    className="w-3 h-3 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Zakończone ({completedImages.length})
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${showCompleted ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showCompleted && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {completedImages.map((image, index) => (
                    <ImageProgressItem
                      key={`completed-${image.fileName}-${index}`}
                      image={image}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
