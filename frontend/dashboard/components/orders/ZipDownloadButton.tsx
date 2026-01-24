import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import React from "react";

import { useDownloadZip, useDownloadFinalZip } from "../../hooks/mutations/useOrderMutations";
import { useZipStatusPolling } from "../../hooks/useZipStatusPolling";
import { queryKeys } from "../../lib/react-query";
import type { Order } from "../../types";
import Button from "../ui/button/Button";

interface ZipProgress {
  processed: number;
  total: number;
  percent: number;
  status?: string;
  message?: string;
  error?: string;
}

interface ZipStatus {
  status: "ready" | "generating" | "not_started" | "error";
  generating: boolean;
  ready: boolean;
  zipExists: boolean;
  zipSize?: number;
  elapsedSeconds?: number;
  progress?: ZipProgress;
  error?: string;
}

interface ZipDownloadButtonProps {
  galleryId: string;
  orderId: string;
  type: "original" | "final";
  deliveryStatus?: string;
  className?: string;
}

/**
 * Reusable ZIP download button component
 * Shows status (disabled, generating, ready) and progress if available
 * Handles click to trigger download
 * Matches design of other buttons in OrderActionsSection
 */
export function ZipDownloadButton({
  galleryId,
  orderId,
  type,
  className = "",
}: ZipDownloadButtonProps) {
  const queryClient = useQueryClient();

  // Check order cache for zipGenerating flags, ready flags, and progress (from dashboard status poll)
  // This allows us to show loader and progress immediately when generation starts
  const orderCache = queryClient.getQueryData<Order>(queryKeys.orders.detail(galleryId, orderId));
  const cacheZipGenerating =
    type === "final"
      ? (orderCache?.finalZipGenerating ?? false)
      : (orderCache?.zipGenerating ?? false);
  const cacheZipReady =
    type === "final"
      ? ((orderCache as Order & { finalZipReady?: boolean })?.finalZipReady ?? false)
      : ((orderCache as Order & { zipReady?: boolean })?.zipReady ?? false);
  const cacheProgress = orderCache?.zipProgress as ZipProgress | undefined;

  const { generating, ready, progress, zipStatus } = useZipStatusPolling({
    galleryId,
    orderId,
    type,
    enabled: !!galleryId && !!orderId,
  });

  // Use progress from polling if available, otherwise fall back to cache
  const effectiveProgress: ZipProgress | undefined = progress ?? cacheProgress;

  const downloadZipMutation = useDownloadZip();
  const downloadFinalZipMutation = useDownloadFinalZip();

  const handleDownload = () => {
    if (type === "final") {
      downloadFinalZipMutation.mutate({ galleryId, orderId });
    } else {
      downloadZipMutation.mutate({ galleryId, orderId });
    }
  };

  // Use cache flag if ZIP status polling hasn't fetched yet
  // This ensures we show loader immediately when generation starts (from dashboard status poll)
  // Backend sets isGenerating flag, so we trust it - no guessing!
  const isGenerating = generating ?? cacheZipGenerating;

  // Use ready flag from ZIP status polling (authoritative source)
  // Fall back to cache ready flag if ZIP status poll hasn't run yet
  // Backend sets ready=true when ZIP exists in S3, so we trust it - no guessing!
  const effectiveReady = ready ?? cacheZipReady;

  // Determine button state
  // Button should always be visible when order is in the right state, but disabled until ZIP is ready
  const isDisabled = Boolean(
    !effectiveReady ||
    isGenerating ||
    downloadZipMutation.isPending ||
    downloadFinalZipMutation.isPending
  );
  // Show loader when generating (even without progress data) or downloading
  const isLoading =
    isGenerating || downloadZipMutation.isPending || downloadFinalZipMutation.isPending;

  // Polish text based on ZIP type and state
  const zipTypeLabel = type === "final" ? "Zdjęcia finalne (ZIP)" : "Wybrane przez klienta (ZIP)";

  let buttonText = `Pobierz ${zipTypeLabel}`;
  let statusInfo: string | null = null;

  // Show generating state when we have data indicating generation is happening
  if (isGenerating) {
    buttonText = `Generowanie ZIP`;

    // Only show progress info if we have actual progress data (from polling or cache)
    if (effectiveProgress) {
      // Show progress percentage - prefer percent if available, otherwise calculate from processed/total
      let progressPercent: number | undefined;
      if (
        effectiveProgress.percent !== undefined &&
        typeof effectiveProgress.percent === "number"
      ) {
        progressPercent = effectiveProgress.percent;
      } else if (
        effectiveProgress.processed !== undefined &&
        effectiveProgress.total !== undefined &&
        effectiveProgress.total > 0
      ) {
        progressPercent = Math.round((effectiveProgress.processed / effectiveProgress.total) * 100);
      }

      if (progressPercent !== undefined && !isNaN(progressPercent)) {
        statusInfo = `${progressPercent}%`;
      }
    }
    // If generating but no progress data yet, just show button with loader (no status info)
  } else if (downloadZipMutation.isPending || downloadFinalZipMutation.isPending) {
    buttonText = `Pobieranie ${zipTypeLabel}...`;
  } else if ((zipStatus as ZipStatus | undefined)?.status === "error" || effectiveProgress?.error) {
    // ZIP generation failed - show error (only if we have error data)
    buttonText = `Błąd generowania ${zipTypeLabel}`;
    const errorProgress = effectiveProgress ?? (zipStatus as ZipStatus | undefined)?.progress;
    statusInfo =
      errorProgress?.error ?? errorProgress?.message ?? "Wystąpił błąd podczas generowania ZIP";
  } else if (effectiveReady) {
    // ZIP is ready
    buttonText = `Pobierz ${zipTypeLabel}`;
  } else {
    // Default disabled state - no status info until we have data
    buttonText = `Pobierz ${zipTypeLabel}`;
    statusInfo = null;
  }

  return (
    <div className={`w-full ${className}`}>
      <Button
        size="md"
        variant="outline"
        onClick={handleDownload}
        disabled={isDisabled}
        className="w-full justify-start"
        startIcon={
          isLoading ? (
            <span className="inline-block">
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            </span>
          ) : effectiveReady ? (
            <Download size={20} aria-hidden="true" />
          ) : (
            <span className="inline-block">
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            </span>
          )
        }
      >
        <div className="flex flex-col items-start gap-0.5">
          <span>{buttonText}</span>
          {statusInfo && (
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              {statusInfo}
            </span>
          )}
          {effectiveProgress &&
            isGenerating &&
            (() => {
              // Calculate percent for progress bar
              let progressPercent: number | undefined;
              if (
                effectiveProgress.percent !== undefined &&
                typeof effectiveProgress.percent === "number"
              ) {
                progressPercent = effectiveProgress.percent;
              } else if (
                effectiveProgress.processed !== undefined &&
                effectiveProgress.total !== undefined &&
                effectiveProgress.total > 0
              ) {
                progressPercent = Math.round(
                  (effectiveProgress.processed / effectiveProgress.total) * 100
                );
              }

              if (progressPercent === undefined || isNaN(progressPercent)) return null;

              return (
                <div className="w-full mt-1 h-1.5 bg-photographer-muted rounded-full overflow-hidden dark:bg-gray-700">
                  <div
                    className="h-full bg-success-500 transition-all duration-300 dark:bg-success-600"
                    style={{ width: `${progressPercent}%` }}
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Postęp generowania ZIP: ${progressPercent}%`}
                  />
                </div>
              );
            })()}
        </div>
      </Button>
    </div>
  );
}
