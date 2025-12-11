import { useQueryClient } from "@tanstack/react-query";
import Uppy from "@uppy/core";
import { useEffect, useRef, useCallback, useState } from "react";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import { resetInfiniteQueryAndRefetchFirstPage } from "../lib/react-query-helpers";
import { createUppyInstance, type UploadType, type TypedUppyFile } from "../lib/uppy-config";

import { useMarkFinalUploadComplete } from "./mutations/useUploadMutations";
import { useToast } from "./useToast";

export interface UseUppyUploadConfig {
  galleryId: string;
  orderId?: string; // Required for 'finals' type
  type: UploadType;
  onUploadComplete?: () => void;
  onValidationNeeded?: (data: {
    uploadedSizeBytes: number;
    originalsLimitBytes: number;
    excessBytes: number;
    nextTierPlan?: string;
    nextTierPriceCents?: number;
    nextTierLimitBytes?: number;
    isSelectionGallery?: boolean;
  }) => void;
  reloadGallery?: () => Promise<void>;
  onScrollReset?: () => void;
}

interface SpeedCalculationState {
  lastBytes: number;
  lastTime: number;
}

interface UploadProgressState {
  current: number;
  total: number;
  bytesUploaded: number;
  bytesTotal: number;
  speed: number;
  timeRemaining: number;
}

export interface UploadStats {
  elapsedTimeMs: number;
  totalBytes: number;
  totalFiles: number;
  successfulCount: number;
  failedCount: number;
  avgSpeedBytesPerSecond: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function validateStorageLimits(
  galleryId: string,
  files: TypedUppyFile[],
  onValidationNeeded?: UseUppyUploadConfig["onValidationNeeded"]
): Promise<boolean> {
  try {
    const totalSize = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
    // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
    // Uppy's onBeforeUpload callback requires synchronous validation during upload initialization.
    const validationResult = await api.galleries.validateUploadLimits(galleryId);

    if (!validationResult.withinLimit) {
      const excessBytes =
        (validationResult.uploadedSizeBytes ?? 0) +
        totalSize -
        (validationResult.originalsLimitBytes ?? 0);

      if (excessBytes > 0) {
        onValidationNeeded?.({
          uploadedSizeBytes: (validationResult.uploadedSizeBytes ?? 0) + totalSize,
          originalsLimitBytes: validationResult.originalsLimitBytes ?? 0,
          excessBytes,
          nextTierPlan: validationResult.nextTierPlan,
          nextTierPriceCents: validationResult.nextTierPriceCents,
          nextTierLimitBytes: validationResult.nextTierLimitBytes,
          isSelectionGallery: validationResult.isSelectionGallery,
        });
        return false;
      }
    }
    return true;
  } catch (error) {
    throw error;
  }
}

function calculateUploadMetrics(
  progress: { bytesUploaded?: number; bytesTotal?: number },
  previousState: SpeedCalculationState | null
): { speed: number; timeRemaining: number; newState: SpeedCalculationState } {
  const now = Date.now();
  const bytesUploaded = progress.bytesUploaded ?? 0;
  const bytesTotal = progress.bytesTotal ?? 0;
  let speed = 0;
  let timeRemaining = 0;

  if (previousState) {
    const timeDiff = (now - previousState.lastTime) / 1000;
    const bytesDiff = bytesUploaded - previousState.lastBytes;
    if (timeDiff > 0) {
      speed = bytesDiff / timeDiff;
    }
  }

  if (speed > 0 && bytesTotal > bytesUploaded) {
    timeRemaining = (bytesTotal - bytesUploaded) / speed;
  }

  return {
    speed,
    timeRemaining,
    newState: { lastBytes: bytesUploaded, lastTime: now },
  };
}

function getTypeLabel(type: UploadType): string {
  return type === "finals" ? "zdjęć finalnych" : "zdjęć";
}

function showUploadResultToast(
  showToast: ReturnType<typeof useToast>["showToast"],
  type: UploadType,
  successfulCount: number,
  failedCount: number
): void {
  const typeLabel = getTypeLabel(type);

  if (failedCount > 0) {
    if (successfulCount > 0) {
      showToast(
        "warning",
        "Częściowy sukces",
        `Przesłano ${successfulCount} z ${successfulCount + failedCount} ${typeLabel}. ${failedCount} nie powiodło się.`
      );
    } else {
      const singleLabel = type === "finals" ? "zdjęcia finalnego" : "zdjęcia";
      showToast("error", "Błąd", `Nie udało się przesłać żadnego ${singleLabel}.`);
    }
  } else if (successfulCount > 0) {
    showToast("success", "Sukces", `${successfulCount} ${typeLabel} zostało przesłanych`);
  }
}

async function handlePostUploadActions(
  queryClient: ReturnType<typeof useQueryClient>,
  galleryId: string,
  orderId: string | undefined,
  type: UploadType,
  _successfulFiles: TypedUppyFile[],
  _reloadGallery?: () => Promise<void>,
  onFinalizingChange?: (isFinalizing: boolean) => void,
  markFinalUploadCompleteMutation?: ReturnType<typeof useMarkFinalUploadComplete>,
  onScrollReset?: () => void
): Promise<void> {
  // Set finalizing state at the start
  onFinalizingChange?.(true);

  try {
    if (type === "finals" && orderId) {
      // Wait for backend to finalize uploads and CloudFront to populate new images
      // This is especially important after pause/resume cycles with multipart uploads
      // 1.5 seconds allows time for:
      // - Backend image processing/thumbnail generation
      // - CloudFront edge locations to have content available
      // - Reduces 403 errors when immediately fetching after upload
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Use mutation hook to ensure order detail is invalidated (status may change from CLIENT_APPROVED/AWAITING_FINAL_PHOTOS to PREPARING_DELIVERY)
      if (markFinalUploadCompleteMutation) {
        await markFinalUploadCompleteMutation.mutateAsync({ galleryId, orderId });
      } else {
        // Fallback to direct API call if mutation not provided (shouldn't happen in normal flow)
        // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
        // Uppy's onComplete callback requires synchronous finalization during upload completion lifecycle.
        await api.uploads.markFinalUploadComplete(galleryId, orderId);
        // Manually invalidate order detail, gallery detail, and gallery list if using fallback
        await queryClient.invalidateQueries({
          queryKey: queryKeys.orders.detail(galleryId, orderId),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.detail(galleryId),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.lists(),
        });
      }

      // Reset and refetch final images infinite queries
      await resetInfiniteQueryAndRefetchFirstPage(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 6 &&
          key[0] === "orders" &&
          key[1] === "detail" &&
          key[2] === galleryId &&
          key[3] === orderId &&
          key[4] === "final-images" &&
          key[5] === "infinite"
        );
      });

      // Also reset gallery images queries for finals type
      await resetInfiniteQueryAndRefetchFirstPage(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 6 &&
          key[0] === "galleries" &&
          key[1] === "detail" &&
          key[2] === galleryId &&
          key[3] === "images" &&
          key[4] === "infinite" &&
          key[5] === "finals"
        );
      });
    } else {
      // For originals, wait for CloudFront to populate new images before refetching
      // This delay allows time for:
      // - Backend image processing/thumbnail generation
      // - CloudFront edge locations to have content available
      // - Reduces 403 errors when immediately fetching after upload
      // Best practice: 1-2 seconds is sufficient for most image processing pipelines
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Reset and refetch infinite queries
      await resetInfiniteQueryAndRefetchFirstPage(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 6 &&
          key[0] === "galleries" &&
          key[1] === "detail" &&
          key[2] === galleryId &&
          key[3] === "images" &&
          key[4] === "infinite" &&
          (key[5] === "originals" || key[5] === "thumb")
        );
      });

      // Invalidate gallery detail to refresh originalsBytesUsed
      // This ensures NextStepsOverlay and other components using useGallery() get updated data
      await queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });
    }

    // Always invalidate gallery list to refresh originalsBytesUsed/finalsBytesUsed
    // This ensures the publish button state is updated in the gallery list view
    await queryClient.invalidateQueries({
      queryKey: queryKeys.galleries.lists(),
    });

    // Reset scroll to top after resetting queries
    onScrollReset?.();

    // Set finalizing state to false after reset and refetch completes
    onFinalizingChange?.(false);
  } catch (error) {
    // Set finalizing state to false even on error
    onFinalizingChange?.(false);
    throw error;
  }
}

/**
 * Check if any file is currently paused
 * Relies on Uppy's native file state - file.isPaused is managed by Uppy
 */
function checkIfAnyFileIsPaused(uppy: Uppy | null): boolean {
  if (!uppy) {
    return false;
  }
  // Trust Uppy's file state - it manages isPaused internally
  const files = Object.values(uppy.getFiles());
  return files.some(
    (f) => f.progress?.uploadStarted && !f.progress.uploadComplete && f.isPaused === true // Uppy manages this property
  );
}

const INITIAL_PROGRESS: UploadProgressState = {
  current: 0,
  total: 0,
  bytesUploaded: 0,
  bytesTotal: 0,
  speed: 0,
  timeRemaining: 0,
};

// ============================================================================
// Main Hook
// ============================================================================

export function useUppyUpload(config: UseUppyUploadConfig) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const markFinalUploadCompleteMutation = useMarkFinalUploadComplete();
  const uppyRef = useRef<Uppy | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ successful: number; failed: number } | null>(
    null
  );
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>(INITIAL_PROGRESS);
  const [isPaused, setIsPaused] = useState(false);
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const speedCalculationRef = useRef<SpeedCalculationState | null>(null);
  const uploadStartTimeRef = useRef<number | null>(null);
  const isCancellingRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;

  // Initialize Uppy instance
  useEffect(() => {
    if (!config.galleryId || (config.type === "finals" && !config.orderId)) {
      if (config.type === "finals" && !config.orderId) {
        // Order ID is required for finals upload
      }
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const uppy = createUppyInstance({
      galleryId: config.galleryId,
      orderId: config.orderId,
      type: config.type,
      onBeforeUpload: async (files: TypedUppyFile[]) => {
        if (configRef.current.type === "originals") {
          try {
            const isValid = await validateStorageLimits(
              configRef.current.galleryId,
              files,
              configRef.current.onValidationNeeded
            );
            return isValid;
          } catch {
            showToast("error", "Błąd", "Nie udało się sprawdzić limitów magazynu");
            return false;
          }
        }
        return true;
      },
      onUploadProgress: (progress) => {
        const metrics = calculateUploadMetrics(progress, speedCalculationRef.current);
        speedCalculationRef.current = metrics.newState;

        setUploadProgress({
          current: progress.current,
          total: progress.total,
          bytesUploaded: progress.bytesUploaded ?? 0,
          bytesTotal: progress.bytesTotal ?? 0,
          speed: metrics.speed,
          timeRemaining: metrics.timeRemaining,
        });
      },
      onComplete: async (result) => {
        // Ignore complete event if we're cancelling - cancelAll() triggers complete event
        if (isCancellingRef.current) {
          return;
        }

        const successfulCount = result.successful.length;
        const failedCount = result.failed.length;
        const totalFiles = successfulCount + failedCount;

        // Calculate upload statistics
        const endTime = Date.now();
        const startTime = uploadStartTimeRef.current;
        const elapsedTimeMs = startTime ? endTime - startTime : 0;

        // Calculate total bytes from successful files
        const validSuccessfulFiles = result.successful.filter((file) => {
          const size = file.size ?? 0;
          return size > 0 && size < 10 * 1024 * 1024 * 1024; // Sanity check: max 10GB per file
        });
        const totalBytes = validSuccessfulFiles.reduce((sum, file) => sum + (file.size ?? 0), 0);

        // Calculate average upload speed (bytes per second)
        const elapsedSeconds = elapsedTimeMs > 0 ? elapsedTimeMs / 1000 : 1; // Avoid division by zero
        const avgSpeedBytesPerSecond =
          totalBytes > 0 && elapsedSeconds > 0 ? totalBytes / elapsedSeconds : 0;

        // Set upload statistics
        const stats: UploadStats = {
          elapsedTimeMs,
          totalBytes,
          totalFiles,
          successfulCount,
          failedCount,
          avgSpeedBytesPerSecond,
        };
        setUploadStats(stats);

        // Set complete state FIRST to prevent flash of upload button
        // React will batch these updates together
        setUploadComplete(true);
        setUploadResult({ successful: successfulCount, failed: failedCount });
        setUploading(false);
        setIsPaused(false);
        setUploadProgress(INITIAL_PROGRESS);
        speedCalculationRef.current = null;
        uploadStartTimeRef.current = null;

        showUploadResultToast(showToast, configRef.current.type, successfulCount, failedCount);

        if (successfulCount > 0) {
          try {
            // Get successful files for size calculation
            const successfulFiles = result.successful || [];
            await handlePostUploadActions(
              queryClient,
              configRef.current.galleryId,
              configRef.current.orderId,
              configRef.current.type,
              successfulFiles,
              configRef.current.reloadGallery,
              setIsFinalizing,
              markFinalUploadCompleteMutation,
              configRef.current.onScrollReset
            );
          } catch (error) {
            // Only show warning if reloadGallery failed, not for other errors
            // The images might still appear, so we just log the error silently
            // and let the cache invalidation handle the refresh
            console.error("[useUppyUpload] Error in post-upload actions:", error);
            // Don't show warning - cache invalidation will ensure images are fetched
            setIsFinalizing(false);
          }
        }
      },
      onError: (error, file) => {
        const fileName = file?.name ?? "nieznany plik";
        showToast("error", "Błąd", `Nie udało się przesłać ${fileName}: ${error.message}`);
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    uppyRef.current = uppy;

    // Track pause state - rely on Uppy's native file.isPaused property
    // Uppy manages pause state internally, we just sync our UI
    const updatePauseState = () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const paused = checkIfAnyFileIsPaused(uppy);
      setIsPaused(paused);
    };

    // Listen to events that affect pause state
    // upload-progress fires during upload (includes pause state changes)
    // upload fires when upload starts
    // We update pause state on these events to keep UI in sync
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    uppy.on("upload-progress", updatePauseState);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    uppy.on("upload", updatePauseState);

    // Also update pause state whenever files change (add/remove)
    // This helps catch state changes after multiple pause/resume cycles
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    uppy.on("file-removed", updatePauseState);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    uppy.on("file-added", updatePauseState);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      uppy.off("upload-progress", updatePauseState);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      uppy.off("upload", updatePauseState);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      uppy.off("file-removed", updatePauseState);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      uppy.off("file-added", updatePauseState);
      uppyRef.current?.cancelAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.galleryId, config.orderId, config.type]);

  const startUpload = useCallback(() => {
    if (!uppyRef.current) {
      return;
    }

    const files = Object.values(uppyRef.current.getFiles());
    if (files.length === 0) {
      showToast("info", "Info", "Wybierz pliki do przesłania");
      return;
    }

    // Reset cancellation flag when starting a new upload
    isCancellingRef.current = false;

    if (uploadComplete) {
      setUploadComplete(false);
      setUploadResult(null);
    }

    // Uppy will manage uploading state through file.progress.uploadStarted
    // We set uploading to true here, and it will be maintained by Uppy's events
    setUploading(true);
    setIsPaused(false);
    setUploadProgress({ ...INITIAL_PROGRESS, total: files.length });

    // Track upload start time for statistics
    uploadStartTimeRef.current = Date.now();
    setUploadStats(null); // Reset stats for new upload

    // Start upload - Uppy will manage the upload state
    uppyRef.current.upload().catch(() => {
      // If upload fails to start, reset state
      setUploading(false);
      setIsPaused(false);
      uploadStartTimeRef.current = null;
      setUploadStats(null);
      showToast("error", "Błąd", "Nie udało się rozpocząć przesyłania");
    });
  }, [showToast, uploadComplete]);

  const cancelUpload = useCallback(async () => {
    if (!uppyRef.current) {
      return;
    }

    // Get all files from Uppy's current state - check all files that have s3KeyShort
    // This is simpler and more robust - we don't need to track anything
    const allFiles = Object.values(uppyRef.current.getFiles());
    const filesWithS3Key = allFiles.filter((file) => {
      const s3KeyShort = file.meta?.s3KeyShort;
      return !!s3KeyShort;
    });

    // Set cancellation flag BEFORE cancelling to ignore the complete event that cancelAll() triggers
    isCancellingRef.current = true;
    uppyRef.current.cancelAll();
    uppyRef.current.clear();

    setUploading(false);
    setIsPaused(false);
    setUploadComplete(false);
    setUploadResult(null);
    setUploadProgress(INITIAL_PROGRESS);
    setUploadStats(null);
    uploadStartTimeRef.current = null;

    // Attempt to delete all files with s3KeyShort from S3
    // Silently ignore errors (files that don't exist, network errors, etc.)
    if (filesWithS3Key.length > 0) {
      const { galleryId, orderId, type } = configRef.current;

      try {
        // Extract filenames from s3KeyShort for all files
        // Format: originals/{filename} or final/{orderId}/{filename}
        const filenames = filesWithS3Key
          .map((file) => {
            const s3KeyShort = file.meta?.s3KeyShort;
            if (!s3KeyShort || typeof s3KeyShort !== "string") {
              return null;
            }
            const parts = s3KeyShort.split("/");
            return parts[parts.length - 1];
          })
          .filter((filename): filename is string => filename !== null);

        if (filenames.length === 0) {
          return;
        }

        if (type === "finals" && orderId) {
          // Delete final images in batch
          // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
          // Uppy's cancelUpload requires synchronous cleanup during upload cancellation lifecycle.
          await api.orders.deleteFinalImage(galleryId, orderId, filenames).catch(() => {
            // Silently ignore - files might not exist or already deleted
          });
        } else {
          // Delete original images in batch
          // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
          // Uppy's cancelUpload requires synchronous cleanup during upload cancellation lifecycle.
          await api.galleries.deleteImage(galleryId, filenames).catch(() => {
            // Silently ignore - files might not exist or already deleted
          });
        }
      } catch {
        // Silently ignore all errors
      }
    }

    // Reset cancellation flag after a brief delay to allow any pending events to be ignored
    setTimeout(() => {
      isCancellingRef.current = false;
    }, 100);
  }, []);

  const pauseUpload = useCallback(() => {
    if (!uppyRef.current || !uploading) {
      return;
    }
    // Use Uppy's built-in pauseAll() method to pause all uploads at once
    // The event listeners will automatically update our pause state via updatePauseState
    uppyRef.current.pauseAll();

    // Also manually trigger pause state update to catch immediate changes
    // This helps ensure state is synced, especially after multiple pause/resume cycles
    const updatePauseState = () => {
      if (uppyRef.current) {
        const paused = checkIfAnyFileIsPaused(uppyRef.current);
        setIsPaused(paused);
      }
    };

    // Update immediately
    updatePauseState();

    // Update after delays to catch async state changes
    setTimeout(updatePauseState, 100);
    setTimeout(updatePauseState, 250);
  }, [uploading]);

  const resumeUpload = useCallback(() => {
    if (!uppyRef.current || !uploading) {
      return;
    }

    // Get all files and check their state before resuming
    // Always call resumeAll() - it's safe even if nothing is paused
    // Uppy will only resume files that are actually paused
    try {
      uppyRef.current.resumeAll();
    } catch (error) {
      // Error calling resumeAll - silently continue
    }

    // Also manually trigger a pause state update to catch immediate changes
    // This helps ensure state is synced, especially after multiple pause/resume cycles
    const updatePauseState = () => {
      if (uppyRef.current) {
        const paused = checkIfAnyFileIsPaused(uppyRef.current);
        setIsPaused(paused);
      }
    };

    // Update immediately
    updatePauseState();

    // Update after delays to catch async state changes
    // Multiple checks help with multiple pause/resume cycles
    setTimeout(updatePauseState, 100);
    setTimeout(updatePauseState, 250);
  }, [uploading]);

  const pauseResumeFile = useCallback((fileId: string) => {
    if (!uppyRef.current) {
      return;
    }
    uppyRef.current.pauseResume(fileId);
  }, []);

  const resetUploadState = useCallback(() => {
    setUploadComplete(false);
    setUploadResult(null);
    setUploadStats(null);
    setIsFinalizing(false);
    uploadStartTimeRef.current = null;
  }, []);

  return {
    uppy: uppyRef.current,
    uploading,
    uploadComplete,
    uploadResult,
    uploadProgress,
    uploadStats,
    isPaused,
    isFinalizing,
    startUpload,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    pauseResumeFile,
    resetUploadState,
  };
}
