import { Check, X } from "lucide-react";
import React from "react";

interface UploadProgressHeaderProps {
  allComplete: boolean;
  isUploadComplete: boolean;
  uploadingCount: number;
  processingCount: number;
  readyCount: number;
  errorCount: number;
  total: number;
  onDismiss?: () => void;
}

export const UploadProgressHeader = ({
  allComplete,
  isUploadComplete,
  uploadingCount,
  processingCount,
  readyCount,
  errorCount,
  total,
  onDismiss,
}: UploadProgressHeaderProps) => {
  return (
    <div className="px-4 py-3 border-b border-gray-400 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {allComplete ? (
          <Check className="w-5 h-5 text-photographer-accent flex-shrink-0" strokeWidth={2} />
        ) : (
          <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-photographer-accent border-t-transparent rounded-full animate-spin" />
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
              {uploadingCount > 0 && `Przesyłanie: ${uploadingCount}`}
              {uploadingCount > 0 && processingCount > 0 && " • "}
              {processingCount > 0 && `Przetwarzanie: ${processingCount}`}
              {uploadingCount === 0 &&
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
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      )}
    </div>
  );
};
