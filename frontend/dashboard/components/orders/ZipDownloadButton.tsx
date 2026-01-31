import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import React, { useState } from "react";

import {
  useDownloadZip,
  useDownloadFinalZip,
  useRetryZipGeneration,
} from "../../hooks/mutations/useOrderMutations";
import { useZipStatusPolling } from "../../hooks/useZipStatusPolling";
import { queryKeys } from "../../lib/react-query";
import type { Order } from "../../types";
import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

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
  error?: {
    message: string;
    attempts: number;
    canRetry: boolean;
    details?: unknown[];
  };
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

  // Check order cache for zipGenerating flags and ready flags (from dashboard status poll)
  // This allows us to show loader immediately when generation starts
  const orderCache = queryClient.getQueryData<Order>(queryKeys.orders.detail(galleryId, orderId));
  const cacheZipGenerating =
    type === "final"
      ? (orderCache?.finalZipGenerating ?? false)
      : (orderCache?.zipGenerating ?? false);
  const cacheZipReady =
    type === "final"
      ? ((orderCache as Order & { finalZipReady?: boolean })?.finalZipReady ?? false)
      : ((orderCache as Order & { zipReady?: boolean })?.zipReady ?? false);

  const { generating, ready, zipStatus } = useZipStatusPolling({
    galleryId,
    orderId,
    type,
    enabled: !!galleryId && !!orderId,
  });

  const downloadZipMutation = useDownloadZip();
  const downloadFinalZipMutation = useDownloadFinalZip();
  const retryZipMutation = useRetryZipGeneration();

  const handleDownload = () => {
    if (type === "final") {
      downloadFinalZipMutation.mutate({ galleryId, orderId });
    } else {
      downloadZipMutation.mutate({ galleryId, orderId });
    }
  };

  const [supportModalOpen, setSupportModalOpen] = useState(false);

  const handleRetry = () => {
    retryZipMutation.mutate({ galleryId, orderId, type });
  };

  const handleErrorClick = () => {
    if (canRetry) {
      handleRetry();
    } else {
      setSupportModalOpen(true);
    }
  };

  // Use generating flag from ZIP status polling (authoritative source)
  // Fall back to cache flag only if ZIP status polling hasn't fetched yet
  // Backend sets isGenerating flag, so we trust it - no guessing!
  // Important: prioritize polling data over cache to ensure UI updates correctly
  const isGenerating = generating ?? cacheZipGenerating;

  // Use ready flag from ZIP status polling (authoritative source)
  // Fall back to cache ready flag only if ZIP status poll hasn't run yet
  // Backend sets ready=true when ZIP exists in S3, so we trust it - no guessing!
  // Important: prioritize polling data over cache to ensure UI updates correctly
  const effectiveReady = ready ?? cacheZipReady;

  // Check for error state
  const hasError = (zipStatus as ZipStatus | undefined)?.status === "error";
  const errorInfo = (zipStatus as ZipStatus | undefined)?.error;
  const canRetry = errorInfo?.canRetry ?? false;

  // Determine button state
  // For error state: button is enabled - click triggers retry (if canRetry) or support modal (if !canRetry)
  const isDisabled = Boolean(
    (!effectiveReady && !hasError) ||
    isGenerating ||
    downloadZipMutation.isPending ||
    downloadFinalZipMutation.isPending ||
    retryZipMutation.isPending
  );
  // Show loader when generating (even without progress data) or downloading or retrying
  const isLoading =
    isGenerating ||
    downloadZipMutation.isPending ||
    downloadFinalZipMutation.isPending ||
    retryZipMutation.isPending;

  // Polish text based on ZIP type and state
  const zipTypeLabel = type === "final" ? "Zdjęcia finalne (ZIP)" : "Wybrane przez klienta (ZIP)";

  let buttonText = `Pobierz ${zipTypeLabel}`;
  let statusInfo: string | null = null;

  // Show generating state when we have data indicating generation is happening
  if (isGenerating) {
    buttonText = `Generowanie ZIP`;
    // No progress percentage shown - generation time depends on number of photos
  } else if (downloadZipMutation.isPending || downloadFinalZipMutation.isPending) {
    buttonText = `Pobieranie ${zipTypeLabel}...`;
  } else if (retryZipMutation.isPending) {
    buttonText = `Ponowne generowanie ZIP...`;
  } else if (hasError) {
    // ZIP generation failed - show error with retry option
    buttonText = canRetry ? `Ponów generowanie` : `Błąd generowania`;
    statusInfo = null; // Don't show detailed error messages
  } else if (effectiveReady) {
    // ZIP is ready
    buttonText = `Pobierz ${zipTypeLabel}`;
  } else {
    // Default disabled state - no status info until we have data
    buttonText = `Pobierz ${zipTypeLabel}`;
    statusInfo = null;
  }

  // Determine button variant and icon based on state
  const buttonVariant = hasError ? "danger" : "outline";
  const startIcon = isLoading ? (
    <span className="inline-block">
      <Loader2 size={20} className="animate-spin" aria-hidden="true" />
    </span>
  ) : hasError && canRetry ? (
    <RefreshCw size={20} aria-hidden="true" />
  ) : hasError ? (
    <AlertCircle size={20} aria-hidden="true" />
  ) : effectiveReady ? (
    <Download size={20} aria-hidden="true" />
  ) : (
    <span className="inline-block">
      <Loader2 size={20} className="animate-spin" aria-hidden="true" />
    </span>
  );

  // Use error handler (retry or support modal) for error state, otherwise download
  const onClickHandler = hasError ? handleErrorClick : handleDownload;

  return (
    <div className={`w-full ${className}`}>
      <Modal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
        className="max-w-md p-6"
      >
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-photographer-heading dark:text-gray-100">
            Błąd generowania ZIP
          </h3>
          <p className="text-photographer-text dark:text-gray-300">
            Generowanie pliku ZIP nie powiodło się po ponownej próbie. Skontaktuj się z supportem,
            aby uzyskać pomoc w pobraniu zdjęć.
          </p>
          <p className="text-sm text-photographer-mutedText dark:text-gray-400">
            Zespół supportu będzie mógł sprawdzić logi i ręcznie uruchomić generowanie archiwum.
          </p>
          <Button variant="outline" onClick={() => setSupportModalOpen(false)}>
            Zamknij
          </Button>
        </div>
      </Modal>
      <Button
        size="md"
        variant={buttonVariant}
        onClick={onClickHandler}
        disabled={isDisabled}
        className="w-full justify-start"
        startIcon={startIcon}
      >
        <div className="flex flex-col items-start gap-0.5">
          <span>{buttonText}</span>
          {statusInfo && (
            <span
              className={`text-xs font-normal ${
                hasError ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {statusInfo}
            </span>
          )}
        </div>
      </Button>
    </div>
  );
}
