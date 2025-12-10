import React from "react";

interface UploadProgressBarProps {
  overallProgress: number;
  isUploadComplete: boolean;
}

export const UploadProgressBar = ({
  overallProgress,
  isUploadComplete,
}: UploadProgressBarProps) => {
  return (
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
  );
};
