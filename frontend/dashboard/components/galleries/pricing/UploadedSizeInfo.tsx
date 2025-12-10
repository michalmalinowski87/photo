import React from "react";

interface UploadedSizeInfoProps {
  uploadedSizeBytes: number;
}

export const UploadedSizeInfo = ({ uploadedSizeBytes }: UploadedSizeInfoProps) => {
  const uploadedMB = (uploadedSizeBytes / (1024 * 1024)).toFixed(2);

  return (
    <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 mb-4">
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
        <strong>Przesłany rozmiar:</strong> {uploadedMB} MB
      </p>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Plan został automatycznie dopasowany do rozmiaru przesłanych zdjęć.
      </p>
    </div>
  );
};
