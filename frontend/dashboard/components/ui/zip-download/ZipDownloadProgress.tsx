import { X, Check } from "lucide-react";
import React, { useEffect, useState } from "react";

import { Loading } from "../loading/Loading";

interface ZipDownloadProgressProps {
  orderId: string;
  galleryId: string;
  status: "generating" | "downloading" | "error" | "success";
  error?: string;
  fileCount?: number;
  totalSize?: number;
  startedAt?: number;
  onDismiss: () => void;
}

export const ZipDownloadProgress = ({
  orderId,
  galleryId: _galleryId,
  status,
  error,
  fileCount,
  totalSize,
  startedAt,
  onDismiss,
}: ZipDownloadProgressProps) => {
  const formatSize = (bytes?: number): string => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  // Real-time elapsed time that updates every second
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    if (!startedAt) return 0;
    return Math.floor((Date.now() - startedAt) / 1000);
  });

  useEffect(() => {
    if (!startedAt || status !== "generating") {
      return;
    }

    // Update immediately
    setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));

    // Then update every second
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, status]);
  const getStatusText = () => {
    switch (status) {
      case "generating":
        return "Generowanie ZIP";
      case "downloading":
        return "Pobieranie ZIP";
      case "error":
        return "Błąd";
      case "success":
        return "Pobrano";
      default:
        return "Przetwarzanie...";
    }
  };

  const getStatusIcon = () => {
    if (status === "error") {
      return <X className="w-5 h-5 text-error-500" strokeWidth={2} />;
    }
    if (status === "success") {
      return <Check className="w-5 h-5 text-success-500" strokeWidth={2} />;
    }
    return <Loading size="sm" />;
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 min-w-[320px] max-w-[400px]">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{getStatusIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              {getStatusText()}
            </h4>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDismiss();
              }}
              className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer relative z-10 p-1"
              style={{ zIndex: 10, pointerEvents: "auto" }}
              aria-label="Zamknij"
              type="button"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Zamówienie: {orderId}</p>

          {status === "generating" && (
            <>
              <div className="mt-1 space-y-0.5">
                {totalSize && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Rozmiar: {formatSize(totalSize)}
                  </p>
                )}
                {startedAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Upłynęło: {formatTime(elapsedSeconds)}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                Pobieranie rozpocznie się automatycznie po wygenerowaniu pliku
              </p>
              <div className="mt-2">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-brand-500 h-1.5 rounded-full transition-all duration-300 animate-pulse"
                    style={{ width: "60%" }}
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-error-600 dark:text-error-400 mt-1 break-words">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
};
