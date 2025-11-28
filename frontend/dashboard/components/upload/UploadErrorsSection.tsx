import React, { useState } from "react";

import type { PerImageProgress } from "./UploadProgressOverlay";

interface UploadErrorsSectionProps {
  errorImages: PerImageProgress[];
}

export const UploadErrorsSection: React.FC<UploadErrorsSectionProps> = ({ errorImages }) => {
  const [showErrors, setShowErrors] = useState(true);

  if (errorImages.length === 0) {
    return null;
  }

  return (
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
          Błędy ({errorImages.length})
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
  );
};
