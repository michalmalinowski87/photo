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
  isFinalizing?: boolean;
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
  isFinalizing = false,
}) => {
  if (!isOpen) {
    return null;
  }

  const typeLabel = getTypeLabel(uploadType);

  const overlayContent = (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full mx-4 border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="px-8 pt-8 pb-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 size={24} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Przesyłanie zakończone
              </h2>
              {isFinalizing && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Finalizowanie przesyłania...
                </p>
              )}
              {!isFinalizing && (
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">Gotowe</p>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pb-6">
          <div className="space-y-3">
            {/* Primary Stats - Larger, more prominent */}
            <div className="grid grid-cols-2 gap-4">
              {/* Number of Photos */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Liczba zdjęć
                </div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {stats.totalFiles}
                </div>
              </div>

              {/* Total Size */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Łączny rozmiar
                </div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatBytes(stats.totalBytes)}
                </div>
              </div>
            </div>

            {/* Secondary Stats - Compact list */}
            <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {/* Time Elapsed */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Czas przesyłania</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatElapsedTime(stats.elapsedTimeMs)}
                </span>
              </div>

              {/* Success Count */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Przesłane pomyślnie
                </span>
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  {stats.successfulCount} / {stats.totalFiles}
                </span>
              </div>

              {/* Failed Count - Only show if there are failures */}
              {stats.failedCount > 0 && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Odrzucone</span>
                  <span className="text-sm font-medium text-red-700 dark:text-red-400">
                    {stats.failedCount} / {stats.totalFiles}
                  </span>
                </div>
              )}

              {/* Average Upload Speed */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Średnia prędkość
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatSpeed(stats.avgSpeedBytesPerSecond)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <Button
            variant="primary"
            onClick={onClose}
            className="min-w-[100px]"
            disabled={isFinalizing}
          >
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
