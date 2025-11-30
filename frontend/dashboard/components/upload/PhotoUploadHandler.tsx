import { useState, useRef, useCallback } from "react";

import { useImagePolling } from "../../hooks/useImagePolling";
import { usePresignedUrls } from "../../hooks/usePresignedUrls";
import { useS3Upload } from "../../hooks/useS3Upload";
import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";
import { useGalleryStore } from "../../store/gallerySlice";

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
  onUploadSuccess?: (fileName: string, file: File, key: string) => void; // Called when S3 upload succeeds (before processing)
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
  const fileNameToFileMapRef = useRef<Map<string, File>>(new Map()); // Track File objects by filename
  const hasTriggeredRecalculationRef = useRef(false); // Guard to ensure recalculation is only called once per batch

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
    onSuccess: (fileName, key) => {
      fileToKeyMapRef.current.set(fileName, key);
      setUploadProgress((prev) => ({
        ...prev,
        successes: prev.successes + 1,
      }));

      // Call onUploadSuccess with File object if available
      const file = fileNameToFileMapRef.current.get(fileName);
      if (file && config.onUploadSuccess) {
        config.onUploadSuccess(fileName, file, key);
      }
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
      fileNameToFileMapRef.current.clear();
      hasTriggeredRecalculationRef.current = false; // Reset guard for new upload batch

      // Store File objects for later use
      imageFiles.forEach((file) => {
        fileNameToFileMapRef.current.set(file.name, file);
      });

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
            uploadErrors.push({ file: result.file, error: result.error ?? "Unknown error" });
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

        // Show summary toast only for errors/warnings
        // Success notification is shown after polling completes in useImagePolling
        const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
        if (uploadErrors.length > 0) {
          if (uploadSuccesses > 0) {
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
        }

        // Handle completion based on type
        if (
          uploadSuccesses > 0 &&
          !uploadCancelRef.current &&
          !hasTriggeredRecalculationRef.current
        ) {
          // TRIGGER 1: Silent recalculation immediately after ALL uploads complete (before processing)
          // This updates storage values as soon as files are in S3, without UI notification
          // Guard ensures this is only called once per upload batch
          hasTriggeredRecalculationRef.current = true;

          // eslint-disable-next-line no-console
          console.log("[PhotoUploadHandler] All uploads complete, triggering recalculation", {
            type: config.type,
            galleryId: config.galleryId,
            orderId: config.orderId,
            uploadSuccesses,
            currentOriginalsBytes: useGalleryStore.getState().currentGallery?.originalsBytesUsed,
            currentFinalsBytes: useGalleryStore.getState().currentGallery?.finalsBytesUsed,
          });

          const { refreshGalleryBytesOnly } = useGalleryStore.getState();
          void refreshGalleryBytesOnly(config.galleryId, true); // forceRecalc = true, silent (no loading state)

          if (config.type === "finals") {
            // eslint-disable-next-line no-console
            console.log(
              "[PhotoUploadHandler] Finals upload complete, marking upload-complete endpoint",
              {
                galleryId: config.galleryId,
                orderId: config.orderId,
              }
            );
            // Mark final upload complete (also triggers recalculation on backend and updates order status)
            try {
              const orderId = config.orderId ?? "";
              await api.uploads.markFinalUploadComplete(config.galleryId, orderId);
              // eslint-disable-next-line no-console
              console.log(
                "[PhotoUploadHandler] Finals upload-complete endpoint called successfully",
                {
                  galleryId: config.galleryId,
                  orderId,
                }
              );
              // Don't call loadOrderData here - it would fetch stale gallery data and overwrite the correct bytes
              // The refreshGalleryBytesOnly call above already updates the bytes correctly
              // Order status will be refreshed when processing completes (via onUploadComplete callback)
              // The onOrderUpdated callback can be used to refresh order status if needed
              if (config.onOrderUpdated && orderId) {
                setTimeout(() => {
                  if (config.onOrderUpdated && orderId) {
                    config.onOrderUpdated(orderId);
                  }
                }, 100);
              }
            } catch (completeErr) {
              // eslint-disable-next-line no-console
              console.error("[PhotoUploadHandler] Failed to mark finals upload complete", {
                error: completeErr,
                galleryId: config.galleryId,
                orderId: config.orderId,
              });
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
