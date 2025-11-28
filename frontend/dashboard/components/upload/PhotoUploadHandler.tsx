import { useState, useRef, useCallback } from "react";

import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";
import { usePresignedUrls } from "../../hooks/usePresignedUrls";
import { useS3Upload } from "../../hooks/useS3Upload";
import { useImagePolling } from "../../hooks/useImagePolling";

import { PerImageProgress } from "./UploadProgressOverlay";

export interface GalleryImage {
  id?: string;
  key?: string;
  filename?: string;
  url?: string;
  thumbUrl?: string;
  previewUrl?: string;
  finalUrl?: string;
  isPlaceholder?: boolean;
  uploadTimestamp?: number;
  uploadIndex?: number;
  size?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface UploadProgress {
  current: number;
  total: number;
  currentFileName: string;
  errors: Array<{ file: string; error: string }>;
  successes: number;
  uploadSpeed?: number;
  estimatedTimeRemaining?: number;
}

export type UploadType = "originals" | "finals";

export interface PhotoUploadHandlerConfig {
  galleryId: string;
  orderId?: string; // Required for 'finals' type
  type: UploadType;
  getInitialImageCount: () => number; // Get current image count
  onImagesUpdated: (images: GalleryImage[]) => void; // Called when images are ready (have URLs)
  onPerImageProgress?: (progress: PerImageProgress[]) => void; // Called when per-image progress updates
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
  onOrderUpdated?: (orderId: string) => void;
  loadOrderData?: () => Promise<void>;
  reloadGallery?: () => Promise<void>;
  deletingImagesRef?: React.MutableRefObject<Set<string>>;
  deletedImageKeysRef?: React.MutableRefObject<Set<string>>;
}

export function usePhotoUploadHandler(config: PhotoUploadHandlerConfig) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    current: 0,
    total: 0,
    currentFileName: "",
    errors: [],
    successes: 0,
  });
  const [perImageProgress, setPerImageProgress] = useState<PerImageProgress[]>([]);
  const [isUploadComplete, setIsUploadComplete] = useState(false);
  const perImageProgressRef = useRef<PerImageProgress[]>([]);
  const uploadCancelRef = useRef(false);
  const fileToKeyMapRef = useRef<Map<string, string>>(new Map());

  // Initialize hooks
  const { fetchPresignedUrls } = usePresignedUrls({
    galleryId: config.galleryId,
    orderId: config.orderId,
    type: config.type,
    onError: (file, error) => {
      setUploadProgress((prev) => ({
        ...prev,
        errors: [...prev.errors, { file, error }],
      }));
    },
  });

  const { uploadFiles } = useS3Upload({
    galleryId: config.galleryId,
    type: config.type,
    updateProgress: (updater) => {
      setPerImageProgress((prev) => {
        const updated = updater(prev);
        perImageProgressRef.current = updated;
        config.onPerImageProgress?.(updated);
        return updated;
      });
    },
    onUploadProgress: (current, total, fileName) => {
      setUploadProgress((prev) => ({
        ...prev,
        current,
        total,
        currentFileName: fileName,
      }));
    },
    onError: (file, error) => {
      setUploadProgress((prev) => ({
        ...prev,
        errors: [...prev.errors, { file, error }],
      }));
    },
    onSuccess: (file, key, fileSize) => {
      fileToKeyMapRef.current.set(file, key);
      setUploadProgress((prev) => ({
        ...prev,
        successes: prev.successes + 1,
      }));
    },
  });

  const { startPolling, stopPolling } = useImagePolling({
    galleryId: config.galleryId,
    orderId: config.orderId,
    type: config.type,
    fileToKeyMap: fileToKeyMapRef.current,
    updateProgress: (updater) => {
      setPerImageProgress((prev) => {
        const updated = updater(prev);
        perImageProgressRef.current = updated;
        config.onPerImageProgress?.(updated);
        return updated;
      });
    },
    getCurrentProgress: () => perImageProgressRef.current,
    onImagesUpdated: config.onImagesUpdated,
    onUploadComplete: config.onUploadComplete,
    onValidationNeeded: config.onValidationNeeded,
    onOrderUpdated: config.onOrderUpdated,
    loadOrderData: config.loadOrderData,
    reloadGallery: config.reloadGallery,
    deletingImagesRef: config.deletingImagesRef,
    deletedImageKeysRef: config.deletedImageKeysRef,
  });

  const handleFileSelect = useCallback(
    async (files: FileList | null): Promise<void> => {
      if (!files || files.length === 0) {
        return;
      }

      const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        showToast("error", "Błąd", "Wybierz pliki graficzne");
        return;
      }

      if (config.type === "finals" && !config.orderId) {
        showToast("error", "Błąd", "Order ID is required for finals upload");
        return;
      }

      if (!config.galleryId) {
        return;
      }

      setUploading(true);
      setIsUploadComplete(false);
      uploadCancelRef.current = false;

      // Initialize upload progress
      setUploadProgress({
        current: 0,
        total: imageFiles.length,
        currentFileName: "",
        errors: [],
        successes: 0,
      });

      // Capture initial image count
      const initialImageCount = config.getInitialImageCount();

      // Initialize per-image progress tracking
      const initialProgress: PerImageProgress[] = imageFiles.map((file) => ({
        fileName: file.name,
        status: "uploading",
        uploadProgress: 0,
      }));
      setPerImageProgress(initialProgress);
      perImageProgressRef.current = initialProgress;
      config.onPerImageProgress?.(initialProgress);
      fileToKeyMapRef.current.clear();

      try {
        // Step 1: Get presigned URLs
        const presignedUrlMap = await fetchPresignedUrls(imageFiles, () => uploadCancelRef.current);

        // Step 2: Upload files to S3
        const uploadResults = await uploadFiles(
          imageFiles,
          presignedUrlMap,
          () => uploadCancelRef.current
        );

        // Collect errors and successes
        const uploadErrors: Array<{ file: string; error: string }> = [];
        let uploadSuccesses = 0;

        uploadResults.forEach((result) => {
          if (result.success) {
            uploadSuccesses++;
          } else {
            uploadErrors.push({ file: result.file, error: result.error || "Unknown error" });
          }
        });

        // Final progress update - upload phase complete
        setUploadProgress((prev) => ({
          ...prev,
          current: imageFiles.length,
          currentFileName: "",
          successes: uploadSuccesses,
          errors: uploadErrors,
        }));

        // Mark upload as complete - now processing phase
        setIsUploadComplete(true);

        // Show summary toast
        const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
        if (uploadErrors.length === 0) {
          showToast(
            "success",
            "Sukces",
            `Wszystkie ${imageFiles.length} ${typeLabel} zostało przesłanych`
          );
        } else if (uploadSuccesses > 0) {
          showToast(
            "warning",
            "Częściowy sukces",
            `Przesłano ${uploadSuccesses} z ${imageFiles.length} ${typeLabel}. ${uploadErrors.length} nie powiodło się.`
          );
        } else {
          showToast(
            "error",
            "Błąd",
            `Nie udało się przesłać żadnego ${typeLabel}. Sprawdź konsolę.`
          );
        }

        // Handle completion based on type
        if (uploadSuccesses > 0 && !uploadCancelRef.current) {
          if (config.type === "finals") {
            // Mark final upload complete
            try {
              const orderId = config.orderId ?? "";
              await api.uploads.markFinalUploadComplete(config.galleryId, orderId);
              if (config.loadOrderData) {
                await config.loadOrderData();
              }
              if (config.onOrderUpdated && orderId) {
                setTimeout(() => {
                  if (config.onOrderUpdated && orderId) {
                    config.onOrderUpdated(orderId);
                  }
                }, 100);
              }
            } catch (_completeErr) {
              showToast(
                "warning",
                "Ostrzeżenie",
                "Zdjęcia zostały przesłane. Jeśli originals nie zostały usunięte, spróbuj ponownie."
              );
            }
          }
        }

        // Step 3: Start polling for processed images
        if (uploadSuccesses > 0 && !uploadCancelRef.current) {
          startPolling(
            {
              expectedNewImageCount: imageFiles.length,
              initialImageCount,
              uploadSuccesses,
            },
            () => uploadCancelRef.current
          );
        }
      } catch (err) {
        stopPolling();

        if (uploadCancelRef.current) {
          const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
          showToast("info", "Anulowano", `Przesyłanie ${typeLabel} zostało anulowane`);
        } else {
          const errorMsg = (err as Error)?.message ?? "Nie udało się przesłać zdjęć";
          showToast("error", "Błąd", errorMsg);
        }
      } finally {
        setUploading(false);
        setUploadProgress({
          current: 0,
          total: 0,
          currentFileName: "",
          errors: [],
          successes: 0,
        });
      }
    },
    [config, showToast, fetchPresignedUrls, uploadFiles, startPolling, stopPolling]
  );

  const cancelUpload = useCallback(() => {
    uploadCancelRef.current = true;
    stopPolling();
  }, [stopPolling]);

  return {
    handleFileSelect,
    uploading,
    uploadProgress,
    perImageProgress,
    isUploadComplete,
    cancelUpload,
  };
}
