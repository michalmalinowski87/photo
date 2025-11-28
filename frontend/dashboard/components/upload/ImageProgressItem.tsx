import React from "react";

import type { PerImageProgress } from "./UploadProgressOverlay";

interface ImageProgressItemProps {
  image: PerImageProgress;
  compact?: boolean;
  isProcessing?: boolean; // True if we're in processing phase (upload complete)
}

export const ImageProgressItem: React.FC<ImageProgressItemProps> = ({
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
