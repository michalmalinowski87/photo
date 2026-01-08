import { CheckCircle2, Loader2 } from "lucide-react";
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

export const UploadCompletionOverlay = ({
  isOpen,
  onClose,
  stats,
  isFinalizing = false,
}: UploadCompletionOverlayProps) => {
  if (!isOpen) {
    return null;
  }

  const overlayContent = (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-2xl w-full mx-4 border border-gray-400 dark:border-gray-800">
        {/* Header with prominent button placement */}
        <div className="px-10 pt-10 pb-6">
          <div className="flex items-start justify-between gap-6 mb-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex-shrink-0 w-14 h-14 rounded-full bg-photographer-elevated dark:bg-photographer-accentDark/30 flex items-center justify-center">
                {isFinalizing ? (
                  <Loader2 size={28} className="text-photographer-accent dark:text-photographer-accent animate-spin" />
                ) : (
                  <CheckCircle2 size={28} className="text-photographer-accent dark:text-photographer-accentLight" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
                  Przesyłanie zakończone
                </h2>
                {isFinalizing && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-photographer-accent rounded-full animate-pulse" />
                      <p className="text-sm font-medium text-photographer-accent dark:text-photographer-accent">
                        Przetwarzanie metadanych i przygotowywanie zdjęć...
                      </p>
                    </div>
                  </div>
                )}
                {!isFinalizing && (
                  <p className="text-sm font-medium text-photographer-accentDark dark:text-photographer-accentLight mt-1">
                    Gotowe
                  </p>
                )}
              </div>
            </div>
            {/* Prominent button - users look for this first */}
            <div className="flex-shrink-0">
              <Button
                variant="primary"
                onClick={onClose}
                className="min-w-[105px] px-6 py-4 text-base font-semibold shadow-lg"
                disabled={isFinalizing}
                startIcon={
                  isFinalizing ? <Loader2 size={18} className="animate-spin" /> : undefined
                }
              >
                {isFinalizing ? "Przetwarzanie..." : "OK"}
              </Button>
            </div>
          </div>
        </div>

        {/* Processing indicator bar when finalizing */}
        {isFinalizing && (
          <div className="px-10 pb-4">
            <div className="h-1.5 bg-photographer-muted dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-photographer-accent rounded-full animate-pulse"
                style={{ width: "100%" }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="px-10 pb-8">
          <div className="space-y-4">
            {/* Primary Stats - Larger, more prominent */}
            <div className="grid grid-cols-2 gap-5">
              {/* Number of Photos */}
              <div className="bg-photographer-background dark:bg-gray-800/50 rounded-xl p-5 border border-gray-400 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Liczba zdjęć
                </div>
                <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {stats.totalFiles}
                </div>
              </div>

              {/* Total Size */}
              <div className="bg-photographer-background dark:bg-gray-800/50 rounded-xl p-5 border border-gray-400 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Łączny rozmiar
                </div>
                <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {formatBytes(stats.totalBytes)}
                </div>
              </div>
            </div>

            {/* Secondary Stats - Compact list */}
            <div className="space-y-3 pt-3 border-t border-gray-400 dark:border-gray-700">
              {/* Time Elapsed */}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Czas przesyłania
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatElapsedTime(stats.elapsedTimeMs)}
                </span>
              </div>

              {/* Success Count */}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Przesłane pomyślnie
                </span>
                <span className="text-sm font-semibold text-photographer-accentDark dark:text-photographer-accentLight">
                  {stats.successfulCount} / {stats.totalFiles}
                </span>
              </div>

              {/* Failed Count - Only show if there are failures */}
              {stats.failedCount > 0 && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Odrzucone
                  </span>
                  <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                    {stats.failedCount} / {stats.totalFiles}
                  </span>
                </div>
              )}

              {/* Average Upload Speed */}
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Średnia prędkość
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatSpeed(stats.avgSpeedBytesPerSecond)}
                </span>
              </div>
            </div>
          </div>
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
