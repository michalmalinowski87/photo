import { CheckCircle2 } from "lucide-react";
import React from "react";
import { createPortal } from "react-dom";

import type { UploadStats } from "../../hooks/useUppyUpload";
import type { UploadType } from "../../lib/uppy-config";
import { formatBytes } from "../../utils/format-bytes";
import Button from "../ui/button/Button";

interface UploadCompletionOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  stats: UploadStats;
  uploadType: UploadType;
}

function formatElapsedTime(ms: number): string {
  if (ms < 1000) {
    return "< 1s";
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) {
    return "0 KB/s";
  }
  return `${formatBytes(bytesPerSecond)}/s`;
}

function getTypeLabel(type: UploadType): string {
  return type === "finals" ? "zdjęć finalnych" : "zdjęć";
}

export const UploadCompletionOverlay: React.FC<UploadCompletionOverlayProps> = ({
  isOpen,
  onClose,
  stats,
  uploadType,
}) => {
  if (!isOpen) {
    return null;
  }

  const typeLabel = getTypeLabel(uploadType);

  const overlayContent = (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={32} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Przesyłanie zakończone
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-4">
            {/* Time Elapsed */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Czas przesyłania:
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatElapsedTime(stats.elapsedTimeMs)}
              </span>
            </div>

            {/* Number of Photos */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Liczba zdjęć:
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {stats.totalFiles}{" "}
                {stats.totalFiles === 1
                  ? uploadType === "finals"
                    ? "zdjęcie finalne"
                    : "zdjęcie"
                  : typeLabel}
              </span>
            </div>

            {/* Total Bytes */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Łączny rozmiar:
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatBytes(stats.totalBytes)}
              </span>
            </div>

            {/* Success Count */}
            <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-500/10 rounded-lg border border-green-200 dark:border-green-500/30">
              <span className="text-sm font-medium text-green-800 dark:text-green-300">
                Przesłane pomyślnie:
              </span>
              <span className="text-sm font-semibold text-green-900 dark:text-green-200">
                {stats.successfulCount} / {stats.totalFiles}
              </span>
            </div>

            {/* Rejected Count */}
            {stats.failedCount > 0 && (
              <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/30">
                <span className="text-sm font-medium text-red-800 dark:text-red-300">
                  Odrzucone:
                </span>
                <span className="text-sm font-semibold text-red-900 dark:text-red-200">
                  {stats.failedCount} / {stats.totalFiles}
                </span>
              </div>
            )}

            {/* Average Upload Speed */}
            <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-200 dark:border-blue-500/30">
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Średnia prędkość:
              </span>
              <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                {formatSpeed(stats.avgSpeedBytesPerSecond)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );

  // Render via portal to document.body to ensure it appears above modal
  if (typeof window !== "undefined") {
    return createPortal(overlayContent, document.body);
  }

  return overlayContent;
};
