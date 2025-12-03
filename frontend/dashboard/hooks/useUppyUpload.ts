import type { UppyFile } from "@uppy/core";
import Uppy from "@uppy/core";
import { useEffect, useRef, useCallback, useState } from "react";

import api from "../lib/api-service";
import { createUppyInstance, type UploadType } from "../lib/uppy-config";
import { useGalleryStore } from "../store/gallerySlice";

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

// ============================================================================
// Helper Functions
// ============================================================================

async function validateStorageLimits(
  galleryId: string,
  files: UppyFile[],
  onValidationNeeded?: UseUppyUploadConfig["onValidationNeeded"]
): Promise<boolean> {
  try {
    const totalSize = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
    const validationResult = await api.galleries.validateUploadLimits(galleryId);

    if (!validationResult.withinLimit) {
      const excessBytes =
        (validationResult.uploadedSizeBytes ?? 0) + totalSize - (validationResult.originalsLimitBytes ?? 0);

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
  galleryId: string,
  orderId: string | undefined,
  type: UploadType,
  expectedSuccessfulCount: number,
  reloadGallery?: () => Promise<void>
): Promise<void> {
  const { refreshGalleryBytesOnly } = useGalleryStore.getState();
  await refreshGalleryBytesOnly(galleryId, true);

  if (type === "finals" && orderId) {
    try {
      // Wait a bit for backend to finalize uploads before marking complete
      // This is especially important after pause/resume cycles with multipart uploads
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await api.uploads.markFinalUploadComplete(galleryId, orderId);
    } catch (error) {
      throw error;
    }
  } else {
    // For originals, wait before fetching to ensure backend has processed all files
    // After pause/resume cycles, backend might still be finalizing multipart uploads,
    // generating thumbnails, or updating the database
    // Wait 1.5 seconds before fetching to give backend processing time
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Invalidate cache so reloadGallery will fetch fresh images
    const { invalidateGalleryImagesCache } = useGalleryStore.getState();
    invalidateGalleryImagesCache(galleryId);
  }

  // Reload gallery UI - this will fetch images and update state
  // We don't fetch here to avoid duplicate requests - let reloadGallery handle it
  // The delay above ensures backend has processed files before reloadGallery fetches
  if (reloadGallery) {
    await reloadGallery();
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
    (f: UppyFile) => 
      f.progress?.uploadStarted && 
      !f.progress.uploadComplete && 
      f.isPaused === true // Uppy manages this property
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
  const uppyRef = useRef<Uppy | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ successful: number; failed: number } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>(INITIAL_PROGRESS);
  const [isPaused, setIsPaused] = useState(false);
  const speedCalculationRef = useRef<SpeedCalculationState | null>(null);
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

    const uppy = createUppyInstance({
      galleryId: config.galleryId,
      orderId: config.orderId,
      type: config.type,
      onBeforeUpload: async (files: UppyFile[]) => {
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

        // Set complete state FIRST to prevent flash of upload button
        // React will batch these updates together
        setUploadComplete(true);
        setUploadResult({ successful: successfulCount, failed: failedCount });
        setUploading(false);
        setIsPaused(false);
        setUploadProgress(INITIAL_PROGRESS);
        speedCalculationRef.current = null;

        showUploadResultToast(showToast, configRef.current.type, successfulCount, failedCount);

        if (successfulCount > 0) {
          try {
            await handlePostUploadActions(
              configRef.current.galleryId,
              configRef.current.orderId,
              configRef.current.type,
              successfulCount,
              configRef.current.reloadGallery
            );
          } catch {
            showToast(
              "warning",
              "Ostrzeżenie",
              "Zdjęcia zostały przesłane. Jeśli zdjęcia nie pojawiły się, odśwież stronę."
            );
          }
        }
      },
      onError: (error, file) => {
        const fileName = file?.name ?? "nieznany plik";
        showToast("error", "Błąd", `Nie udało się przesłać ${fileName}: ${error.message}`);
      },
    });

    uppyRef.current = uppy;

    // Track pause state - rely on Uppy's native file.isPaused property
    // Uppy manages pause state internally, we just sync our UI
    const updatePauseState = () => {
      const paused = checkIfAnyFileIsPaused(uppy);
      setIsPaused(paused);
    };

    // Listen to events that affect pause state
    // upload-progress fires during upload (includes pause state changes)
    // upload fires when upload starts
    // We update pause state on these events to keep UI in sync
    uppy.on("upload-progress", updatePauseState);
    uppy.on("upload", updatePauseState);
    
    // Also update pause state whenever files change (add/remove)
    // This helps catch state changes after multiple pause/resume cycles
    uppy.on("file-removed", updatePauseState);
    uppy.on("file-added", updatePauseState);

    return () => {
      uppy.off("upload-progress", updatePauseState);
      uppy.off("upload", updatePauseState);
      uppy.off("file-removed", updatePauseState);
      uppy.off("file-added", updatePauseState);
      uppyRef.current?.cancelAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.galleryId, config.orderId, config.type]);

  const startUpload = useCallback(() => {
    if (!uppyRef.current) {return;}

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

    // Start upload - Uppy will manage the upload state
    uppyRef.current.upload().catch(() => {
      // If upload fails to start, reset state
      setUploading(false);
      setIsPaused(false);
      showToast("error", "Błąd", "Nie udało się rozpocząć przesyłania");
    });
  }, [showToast, uploadComplete]);

  const cancelUpload = useCallback(async () => {
    if (!uppyRef.current) {return;}
    
    // Get all files from Uppy's current state - check all files that have s3KeyShort
    // This is simpler and more robust - we don't need to track anything
    const allFiles = Object.values(uppyRef.current.getFiles());
    const filesWithS3Key = allFiles.filter((file: UppyFile) => {
      const s3KeyShort = file.meta?.s3KeyShort as string | undefined;
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
    
    // Attempt to delete all files with s3KeyShort from S3
    // Silently ignore errors (files that don't exist, network errors, etc.)
    if (filesWithS3Key.length > 0) {
      const { galleryId, orderId, type } = configRef.current;
      
      try {
        // Extract filenames from s3KeyShort for all files
        // Format: originals/{timestamp}_{index}_{filename} or final/{orderId}/{filename}
        const filenames = filesWithS3Key
          .map((file: UppyFile) => {
            const s3KeyShort = file.meta?.s3KeyShort as string;
            if (!s3KeyShort) {
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
          await api.orders.deleteFinalImagesBatch(galleryId, orderId, filenames).catch(() => {
            // Silently ignore - files might not exist or already deleted
          });
        } else {
          // Delete original images in batch
          await api.galleries.deleteImagesBatch(galleryId, filenames).catch(() => {
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
    const files = Object.values(uppyRef.current.getFiles());
    const pausedFiles = files.filter(
      (f: UppyFile) => 
        f.progress?.uploadStarted && 
        !f.progress.uploadComplete && 
        f.isPaused === true
    );
    
    // eslint-disable-next-line no-console
    console.log("[useUppyUpload] resumeUpload", {
      totalFiles: files.length,
      pausedFiles: pausedFiles.length,
      pausedFileIds: pausedFiles.map((f: UppyFile) => f.id),
      allFilesState: files.map((f: UppyFile) => ({
        id: f.id,
        name: f.name,
        uploadStarted: f.progress?.uploadStarted,
        uploadComplete: f.progress?.uploadComplete,
        isPaused: f.isPaused,
      })),
    });
    
    // Always call resumeAll() - it's safe even if nothing is paused
    // Uppy will only resume files that are actually paused
    // eslint-disable-next-line no-console
    console.log("[useUppyUpload] Calling resumeAll()", {
      pausedFilesCount: pausedFiles.length,
      uppyInstance: !!uppyRef.current,
    });
    
    try {
      uppyRef.current.resumeAll();
      // eslint-disable-next-line no-console
      console.log("[useUppyUpload] resumeAll() called successfully");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[useUppyUpload] Error calling resumeAll()", error);
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
    const file = uppyRef.current.getFile(fileId);
    const wasPaused = file?.isPaused ?? false;
    // eslint-disable-next-line no-console
    console.log("[useUppyUpload] pauseResumeFile", {
      fileId,
      fileName: file?.name,
      wasPaused,
      willBePaused: !wasPaused,
    });
    uppyRef.current.pauseResume(fileId);
  }, []);

  const resetUploadState = useCallback(() => {
    setUploadComplete(false);
    setUploadResult(null);
  }, []);

  return {
    uppy: uppyRef.current,
    uploading,
    uploadComplete,
    uploadResult,
    uploadProgress,
    isPaused,
    startUpload,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    pauseResumeFile,
    resetUploadState,
  };
}
