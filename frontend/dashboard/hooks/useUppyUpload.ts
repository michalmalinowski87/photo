import { useEffect, useRef, useCallback, useState } from "react";
import type { UppyFile } from "@uppy/core";
import Uppy from "@uppy/core";

import { createUppyInstance, type UploadType, type UppyConfigOptions } from "../lib/uppy-config";
import api from "../lib/api-service";
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
  onRecoveryDetected?: (fileCount: number) => void;
}

interface UploadState {
  galleryId: string;
  orderId?: string;
  type: UploadType;
  url: string;
  uploadStartedAt: number;
  isActiveUpload: boolean;
  fileCount: number;
}

const getStorageKey = (galleryId: string, type: UploadType): string => {
  return `uppy_upload_state_${galleryId}_${type}`;
};

const saveUploadState = (state: UploadState): void => {
  if (typeof window === "undefined") return;
  const key = getStorageKey(state.galleryId, state.type);
  localStorage.setItem(key, JSON.stringify(state));
};

const clearUploadState = (galleryId: string, type: UploadType): void => {
  if (typeof window === "undefined") return;
  const key = getStorageKey(galleryId, type);
  localStorage.removeItem(key);
};

const getUploadState = (galleryId: string, type: UploadType): UploadState | null => {
  if (typeof window === "undefined") return null;
  const key = getStorageKey(galleryId, type);
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as UploadState;
  } catch {
    return null;
  }
};

export function useUppyUpload(config: UseUppyUploadConfig) {
  const { showToast } = useToast();
  const uppyRef = useRef<Uppy | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ 
    current: 0, 
    total: 0,
    bytesUploaded: 0,
    bytesTotal: 0,
    speed: 0,
    timeRemaining: 0,
  });
  const [isPaused, setIsPaused] = useState(false);
  const recoveryDetectedRef = useRef(false);
  const speedCalculationRef = useRef<{ lastBytes: number; lastTime: number } | null>(null);

  // Initialize Uppy instance
  useEffect(() => {
    if (!config.galleryId) {
      return;
    }

    // Validate finals type requires orderId
    if (config.type === "finals" && !config.orderId) {
      // eslint-disable-next-line no-console
      console.warn("Order ID is required for finals upload");
      return;
    }

    // Get recovery URL from current location or stored state
    const recoveryUrl = typeof window !== "undefined" ? window.location.href : "";
    const storedState = getUploadState(config.galleryId, config.type);
    const finalRecoveryUrl = storedState?.url || recoveryUrl;

    const uppy = createUppyInstance({
      galleryId: config.galleryId,
      orderId: config.orderId,
      type: config.type,
      recoveryUrl: finalRecoveryUrl,
      onBeforeUpload: async (files: UppyFile[]) => {
        // Validate storage limits before upload
        if (config.type === "originals") {
          try {
            const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
            const validationResult = await api.galleries.validateUploadLimits(config.galleryId);

            if (!validationResult.withinLimit) {
              const excessBytes = (validationResult.uploadedSizeBytes || 0) + totalSize - (validationResult.originalsLimitBytes || 0);
              
              if (excessBytes > 0) {
                config.onValidationNeeded?.({
                  uploadedSizeBytes: (validationResult.uploadedSizeBytes || 0) + totalSize,
                  originalsLimitBytes: validationResult.originalsLimitBytes || 0,
                  excessBytes,
                  nextTierPlan: validationResult.nextTierPlan,
                  nextTierPriceCents: validationResult.nextTierPriceCents,
                  nextTierLimitBytes: validationResult.nextTierLimitBytes,
                  isSelectionGallery: validationResult.isSelectionGallery,
                });
                return false; // Cancel upload
              }
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Failed to validate upload limits:", error);
            showToast("error", "Błąd", "Nie udało się sprawdzić limitów magazynu");
            return false;
          }
        }
        // Mark upload as active before starting
        saveUploadState({
          galleryId: config.galleryId,
          orderId: config.orderId,
          type: config.type,
          url: finalRecoveryUrl,
          uploadStartedAt: Date.now(),
          isActiveUpload: true,
          fileCount: files.length,
        });
        return true; // Proceed with upload
      },
      onUploadProgress: (progress) => {
        // Calculate upload speed and time remaining from progress data
        const now = Date.now();
        let speed = 0;
        let timeRemaining = 0;
        const bytesUploaded = progress.bytesUploaded || 0;
        const bytesTotal = progress.bytesTotal || 0;

        if (speedCalculationRef.current) {
          const timeDiff = (now - speedCalculationRef.current.lastTime) / 1000; // seconds
          const bytesDiff = bytesUploaded - speedCalculationRef.current.lastBytes;
          if (timeDiff > 0) {
            speed = bytesDiff / timeDiff; // bytes per second
          }
        }

        // Update speed calculation ref
        speedCalculationRef.current = {
          lastBytes: bytesUploaded,
          lastTime: now,
        };

        // Calculate time remaining
        if (speed > 0 && bytesTotal > bytesUploaded) {
          const bytesRemaining = bytesTotal - bytesUploaded;
          timeRemaining = bytesRemaining / speed; // seconds
        }

        setUploadProgress({
          current: progress.current,
          total: progress.total,
          bytesUploaded,
          bytesTotal,
          speed,
          timeRemaining,
        });
      },
      onComplete: async (result) => {
        setUploading(false);
        setUploadProgress({ 
          current: 0, 
          total: 0,
          bytesUploaded: 0,
          bytesTotal: 0,
          speed: 0,
          timeRemaining: 0,
        });
        setIsPaused(false);
        speedCalculationRef.current = null;

        // Clear active upload flag and Golden Retriever stored files
        clearUploadState(config.galleryId, config.type);
        
        // Clear all files from Uppy (this also clears Golden Retriever's IndexedDB storage)
        uppy.clear();

        const successfulCount = result.successful.length;
        const failedCount = result.failed.length;

        if (failedCount > 0) {
          const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
          if (successfulCount > 0) {
            showToast(
              "warning",
              "Częściowy sukces",
              `Przesłano ${successfulCount} z ${successfulCount + failedCount} ${typeLabel}. ${failedCount} nie powiodło się.`
            );
          } else {
            showToast(
              "error",
              "Błąd",
              `Nie udało się przesłać żadnego ${typeLabel}.`
            );
          }
        } else if (successfulCount > 0) {
          const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
          showToast("success", "Sukces", `${successfulCount} ${typeLabel} zostało przesłanych`);
        }

        // Handle post-upload actions
        if (successfulCount > 0) {
          // Immediately fetch photos and update state (no delay)
          if (config.type === "finals" && config.orderId) {
            // Mark final upload complete first
            try {
              await api.uploads.markFinalUploadComplete(config.galleryId, config.orderId);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error("Failed to mark finals upload complete:", error);
              showToast(
                "warning",
                "Ostrzeżenie",
                "Zdjęcia zostały przesłane. Jeśli originals nie zostały usunięte, spróbuj ponownie."
              );
            }
            // For finals, reloadGallery callback handles fetching from orders endpoint
            if (config.reloadGallery) {
              await config.reloadGallery();
            }
          } else {
            // For originals, fetch from gallery images endpoint immediately
            // fetchGalleryImages will update bytes used, so we don't need separate refreshGalleryBytesOnly call
            const { invalidateGalleryImagesCache, fetchGalleryImages } = useGalleryStore.getState();
            invalidateGalleryImagesCache(config.galleryId);
            await fetchGalleryImages(config.galleryId, true); // Force refresh - this also updates bytes

            // Update local component state
            if (config.reloadGallery) {
              await config.reloadGallery();
            }
          }

          // Call completion callback
          if (config.onUploadComplete) {
            config.onUploadComplete();
          }
        }

        // Files already cleared above
      },
      onError: (error, file) => {
        // eslint-disable-next-line no-console
        console.error("Upload error:", error, file);
        const fileName = file?.name || "nieznany plik";
        showToast("error", "Błąd", `Nie udało się przesłać ${fileName}: ${error.message}`);
      },
    });

    // Handle Golden Retriever recovery
    uppy.on("restored", () => {
      const files = Object.values(uppy.getFiles());
      if (files.length > 0 && !recoveryDetectedRef.current) {
        recoveryDetectedRef.current = true;
        config.onRecoveryDetected?.(files.length);
        showToast("info", "Odzyskano", `Odzyskano ${files.length} ${files.length === 1 ? "plik" : "plików"} z poprzedniej sesji`);
      }
    });

    uppyRef.current = uppy;

    // Cleanup on unmount - Uppy handles most cleanup internally
    // We just need to cancel any ongoing uploads
    return () => {
      if (uppyRef.current) {
        // Cancel any ongoing uploads (Uppy will handle cleanup)
        uppyRef.current.cancelAll();
        // Clear active upload flag on unmount if upload was in progress
        if (uploading) {
          clearUploadState(config.galleryId, config.type);
        }
      }
      uppyRef.current = null;
    };
  }, [config.galleryId, config.orderId, config.type, showToast, config.onValidationNeeded, config.onUploadComplete, config.reloadGallery, config.onRecoveryDetected, uploading]);

  const startUpload = useCallback(() => {
    if (!uppyRef.current) {
      return;
    }

    const files = Object.values(uppyRef.current.getFiles());
    if (files.length === 0) {
      showToast("info", "Info", "Wybierz pliki do przesłania");
      return;
    }

    setUploading(true);
    setIsPaused(false);
    setUploadProgress({ current: 0, total: files.length });
    uppyRef.current.upload().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Upload failed:", error);
      setUploading(false);
      setIsPaused(false);
      clearUploadState(config.galleryId, config.type);
      showToast("error", "Błąd", "Nie udało się rozpocząć przesyłania");
    });
  }, [showToast, config.galleryId, config.type]);

  const cancelUpload = useCallback(() => {
    if (uppyRef.current) {
      uppyRef.current.cancelAll();
      setUploading(false);
      setIsPaused(false);
      setUploadProgress({ current: 0, total: 0 });
      // Clear active upload flag (marks as deliberate cancellation)
      clearUploadState(config.galleryId, config.type);
      // Clear all files from Uppy (this also clears Golden Retriever's IndexedDB storage)
      uppyRef.current.clear();
    }
  }, [config.galleryId, config.type]);

  const pauseUpload = useCallback(() => {
    if (!uppyRef.current || !uploading) {
      return;
    }
    const files = Object.values(uppyRef.current.getFiles());
    files.forEach((file) => {
      if (file.progress?.uploadStarted && !file.progress.uploadComplete) {
        uppyRef.current?.pauseResume(file.id);
      }
    });
    setIsPaused(true);
  }, [uploading]);

  const resumeUpload = useCallback(() => {
    if (!uppyRef.current || !isPaused) {
      return;
    }
    const files = Object.values(uppyRef.current.getFiles());
    files.forEach((file) => {
      if (file.progress?.uploadStarted && !file.progress.uploadComplete) {
        uppyRef.current?.pauseResume(file.id);
      }
    });
    setIsPaused(false);
  }, [isPaused]);

  const pauseResumeFile = useCallback((fileId: string) => {
    if (!uppyRef.current) {
      return;
    }
    uppyRef.current.pauseResume(fileId);
    // Update paused state based on current file states
    const files = Object.values(uppyRef.current.getFiles());
    const hasPausedFiles = files.some(
      (f) => f.progress?.uploadStarted && !f.progress.uploadComplete && f.isPaused
    );
    setIsPaused(hasPausedFiles);
  }, []);

  const getCurrentUploadState = useCallback((): { paused: boolean; uploading: boolean; completed: number; total: number } => {
    if (!uppyRef.current) {
      return { paused: false, uploading: false, completed: 0, total: 0 };
    }
    const files = Object.values(uppyRef.current.getFiles());
    const uploadingFiles = files.filter((f) => f.progress?.uploadStarted);
    const completed = uploadingFiles.filter((f) => f.progress?.uploadComplete).length;
    const paused = files.some((f) => f.isPaused);
    return {
      paused,
      uploading: uploadingFiles.length > 0 && completed < uploadingFiles.length,
      completed,
      total: uploadingFiles.length,
    };
  }, []);

  return {
    uppy: uppyRef.current,
    uploading,
    uploadProgress,
    isPaused,
    startUpload,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    pauseResumeFile,
    getUploadState: getCurrentUploadState,
  };
}

