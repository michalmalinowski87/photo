import React, { useState } from "react";

import { ImageProgressItem } from "./ImageProgressItem";
import type { PerImageProgress } from "./UploadProgressOverlay";

interface CompletedItemsSectionProps {
  completedImages: PerImageProgress[];
}

export const CompletedItemsSection: React.FC<CompletedItemsSectionProps> = ({
  completedImages,
}) => {
  const [showCompleted, setShowCompleted] = useState(false);

  if (completedImages.length === 0) {
    return null;
  }

  return (
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Zakończone ({completedImages.length})
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${showCompleted ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {showCompleted && (
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
          {completedImages.map((image, index) => (
            <ImageProgressItem key={`completed-${image.fileName}-${index}`} image={image} compact />
          ))}
        </div>
      )}
    </div>
  );
};
