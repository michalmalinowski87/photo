import { useState, useRef, useCallback } from "react";
import api from "../lib/api-service";
import { useToast } from "./useToast";

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
  [key: string]: any;
}

export interface UploadProgress {
  current: number;
  total: number;
  currentFileName: string;
  errors: Array<{ file: string; error: string }>;
  successes: number;
  startTime?: number;
  lastUpdateTime?: number;
  uploadSpeed?: number;
  estimatedTimeRemaining?: number;
}

export type UploadType = "originals" | "finals";

export interface UploadConfig {
  galleryId: string;
  orderId?: string; // Required for 'finals' type
  type: UploadType;
  onPlaceholdersCreated?: (placeholders: GalleryImage[], currentImages: GalleryImage[]) => number; // Returns initial image count
  onImagesUpdated?: (images: GalleryImage[]) => void;
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
}

export function useImageUploadWithPlaceholders(config: UploadConfig) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    current: 0,
    total: 0,
    currentFileName: "",
    errors: [],
    successes: 0,
  });
  const uploadCancelRef = useRef(false);
  const pollingActiveRef = useRef(false);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deletingImagesRef = useRef<Set<string>>(new Set());
  const deletedImageKeysRef = useRef<Set<string>>(new Set());

  // Helper function to retry a request with exponential backoff and jitter
  const retryWithBackoff = useCallback(
    async <T>(
      fn: () => Promise<T>,
      maxRetries: number = 5,
      baseDelay: number = 500
    ): Promise<T> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          if (attempt === maxRetries - 1) throw error;
          const exponentialDelay = baseDelay * Math.pow(2, attempt);
          const jitter = Math.random() * 0.3 * exponentialDelay;
          const delay = exponentialDelay + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw new Error("Max retries exceeded");
    },
    []
  );

  const handleFileSelect = useCallback(
    async (files: FileList | null): Promise<void> => {
      if (!files || files.length === 0) return;

      const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        showToast("error", "Błąd", "Wybierz pliki graficzne");
        return;
      }

      if (config.type === "finals" && !config.orderId) {
        showToast("error", "Błąd", "Order ID is required for finals upload");
        return;
      }

      setUploading(true);
      uploadCancelRef.current = false;

      const startTime = Date.now();
      setUploadProgress({
        current: 0,
        total: imageFiles.length,
        currentFileName: "",
        errors: [],
        successes: 0,
        startTime,
        lastUpdateTime: startTime,
      });

      // Create placeholders immediately for better UX
      const uploadBatchId = Date.now();
      const placeholders: GalleryImage[] = imageFiles.map((file, index) => ({
        key: file.name,
        filename: file.name,
        url: URL.createObjectURL(file), // Use blob URL for placeholder preview
        isPlaceholder: true,
        uploadTimestamp: uploadBatchId,
        uploadIndex: index,
        size: file.size,
      }));

      // Get current images from parent before adding placeholders
      // We need to call a getter function or use a ref - but since we don't have direct access,
      // we'll call the callback with placeholders and let it handle state update and return count
      // The callback should update state and return the count BEFORE the update
      let initialImageCount = 0;
      if (config.onPlaceholdersCreated) {
        // Call with empty array as currentImages - callback will read its own state
        // This is a bit hacky but necessary since we can't access parent state directly
        initialImageCount = config.onPlaceholdersCreated(placeholders, []) || 0;
      }

      try {
        // Dynamic batch sizing
        let currentBatchSize = Math.min(15, Math.max(5, Math.floor(imageFiles.length / 10)));
        let consecutiveErrors = 0;
        const uploadErrors: Array<{ file: string; error: string }> = [];
        let uploadSuccesses = 0;

        // Process uploads in batches
        for (let i = 0; i < imageFiles.length; i += currentBatchSize) {
          if (uploadCancelRef.current) {
            throw new Error("Upload cancelled by user");
          }

          const batch = imageFiles.slice(i, i + currentBatchSize);
          let batchErrors = 0;

          await Promise.allSettled(
            batch.map(async (file, batchIndex) => {
              const globalIndex = i + batchIndex;

              if (uploadCancelRef.current) {
                throw new Error("Upload cancelled");
              }

              // Update progress
              const now = Date.now();
              setUploadProgress((prev) => {
                const elapsed = (now - (prev.startTime || now)) / 1000;
                const uploaded = globalIndex + 1;
                const remaining = imageFiles.length - uploaded;
                const speed = elapsed > 0 ? uploaded / elapsed : 0;
                const estimatedTimeRemaining = speed > 0 ? remaining / speed : 0;

                return {
                  ...prev,
                  current: uploaded,
                  currentFileName: file.name,
                  lastUpdateTime: now,
                  uploadSpeed: speed,
                  estimatedTimeRemaining,
                };
              });

              try {
                let presignResponse: { url: string };

                if (config.type === "finals") {
                  // Finals upload - use order-specific endpoint
                  presignResponse = await retryWithBackoff(async () => {
                    return await api.uploads.getFinalImagePresignedUrl(
                      config.galleryId,
                      config.orderId!,
                      {
                        key: file.name,
                        contentType: file.type || "image/jpeg",
                      }
                    );
                  });
                } else {
                  // Originals upload - use gallery endpoint
                  const timestamp = Date.now();
                  const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
                  const key = `originals/${timestamp}_${sanitizedFilename}`;

                  presignResponse = await retryWithBackoff(async () => {
                    return await api.uploads.getPresignedUrl({
                      galleryId: config.galleryId,
                      key,
                      contentType: file.type || "image/jpeg",
                      fileSize: file.size,
                    });
                  });
                }

                // Upload file to S3
                const uploadController = new AbortController();
                const uploadTimeout = setTimeout(() => uploadController.abort(), 300000);

                try {
                  const uploadResponse = await fetch(presignResponse.url, {
                    method: "PUT",
                    body: file,
                    headers: {
                      "Content-Type": file.type || "image/jpeg",
                    },
                    signal: uploadController.signal,
                  });

                  clearTimeout(uploadTimeout);

                  if (!uploadResponse.ok) {
                    throw new Error(
                      `Failed to upload ${file.name}: ${uploadResponse.status} ${uploadResponse.statusText}`
                    );
                  }

                  uploadSuccesses++;
                  return { success: true, file: file.name };
                } catch (uploadError) {
                  clearTimeout(uploadTimeout);
                  throw uploadError;
                }
              } catch (error) {
                const errorMessage = (error as Error).message || "Unknown error";
                uploadErrors.push({ file: file.name, error: errorMessage });
                batchErrors++;
                return { success: false, file: file.name, error: errorMessage };
              }
            })
          );

          setUploadProgress((prev) => ({
            ...prev,
            successes: uploadSuccesses,
            errors: uploadErrors,
          }));

          // Adaptive batch sizing
          if (batchErrors > 0) {
            consecutiveErrors++;
            currentBatchSize = Math.max(3, Math.floor(currentBatchSize * 0.7));
          } else {
            consecutiveErrors = 0;
            if (currentBatchSize < 20) {
              currentBatchSize = Math.min(20, Math.floor(currentBatchSize * 1.1));
            }
          }

          // Delay between batches
          const baseDelay = 100;
          const errorPenalty = batchErrors * 50;
          const batchSizePenalty = currentBatchSize * 10;
          const delay = baseDelay + errorPenalty + batchSizePenalty;

          if (i + currentBatchSize < imageFiles.length && !uploadCancelRef.current) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        // Final progress update
        setUploadProgress((prev) => ({
          ...prev,
          current: imageFiles.length,
          currentFileName: "",
        }));

        // Show summary toast
        if (uploadErrors.length === 0) {
          const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
          showToast(
            "success",
            "Sukces",
            `Wszystkie ${imageFiles.length} ${typeLabel} zostało przesłanych`
          );
        } else if (uploadSuccesses > 0) {
          const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
          showToast(
            "warning",
            "Częściowy sukces",
            `Przesłano ${uploadSuccesses} z ${imageFiles.length} ${typeLabel}. ${uploadErrors.length} nie powiodło się.`
          );
        } else {
          const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
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
              await api.uploads.markFinalUploadComplete(config.galleryId, config.orderId!);
              if (config.loadOrderData) {
                await config.loadOrderData();
              }
              if (config.onOrderUpdated && config.orderId) {
                setTimeout(() => {
                  config.onOrderUpdated!(config.orderId!);
                }, 100);
              }
            } catch (completeErr) {
              showToast(
                "warning",
                "Ostrzeżenie",
                "Zdjęcia zostały przesłane. Jeśli originals nie zostały usunięte, spróbuj ponownie."
              );
            }
          } else {
            // Validate upload limits for originals
            if (uploadSuccesses > 0) {
              // Wait a bit for backend to process images
              await new Promise((resolve) => setTimeout(resolve, 3000));

              try {
                const validationResult = await api.galleries.validateUploadLimits(config.galleryId);

                if (!validationResult.withinLimit && validationResult.excessBytes !== undefined) {
                  config.onValidationNeeded?.({
                    uploadedSizeBytes: validationResult.uploadedSizeBytes,
                    originalsLimitBytes: validationResult.originalsLimitBytes!,
                    excessBytes: validationResult.excessBytes,
                    nextTierPlan: validationResult.nextTierPlan,
                    nextTierPriceCents: validationResult.nextTierPriceCents,
                    nextTierLimitBytes: validationResult.nextTierLimitBytes,
                    isSelectionGallery: validationResult.isSelectionGallery,
                  });
                }
              } catch (validationError) {
                console.error("Failed to validate upload limits:", validationError);
              }
            }

            if (config.reloadGallery) {
              await config.reloadGallery();
            }
          }
        }

        // Start polling to replace placeholders with real images
        const expectedNewImageCount = imageFiles.length;
        let attempts = 0;
        const maxAttempts = 60;
        const pollInterval = 1000;
        pollingActiveRef.current = true;

        const pollForImages = async (): Promise<void> => {
          if (!pollingActiveRef.current || uploadCancelRef.current) {
            return;
          }

          attempts++;

          try {
            let images: GalleryImage[] = [];

            if (config.type === "finals") {
              // Poll for final images
              const finalResponse = await api.orders.getFinalImages(
                config.galleryId,
                config.orderId!
              );
              images = (finalResponse.images || []).map((img: any) => ({
                ...img,
                url: img.finalUrl || img.url,
              }));
            } else {
              // Poll for originals
              const photosResponse = await api.galleries.getImages(config.galleryId);
              images = photosResponse?.images || [];
            }

            // Filter out deleted images
            const validImages = images.filter((img: GalleryImage) => {
              const imgKey = img.key || img.filename;
              if (!imgKey) return false;
              if (deletingImagesRef.current.has(imgKey)) return false;
              if (deletedImageKeysRef.current.has(imgKey)) return false;
              return true;
            });

            // Notify parent component about updated images
            config.onImagesUpdated?.(validImages);

            // Check if we have new images
            // For finals: count should increase by expectedNewImageCount
            // For originals: check if uploaded files appear in the response
            let hasNewImages = false;
            if (config.type === "finals") {
              const currentRealImageCount = validImages.length;
              hasNewImages = currentRealImageCount >= initialImageCount + expectedNewImageCount;
            } else {
              // For originals, check if any uploaded filenames appear in the response
              const uploadedFileNames = imageFiles.map((f) => f.name);
              const foundUploadedImages = validImages.filter((img: GalleryImage) => {
                const imgKey = img.key || img.filename || "";
                return uploadedFileNames.some((name) => imgKey.includes(name));
              });
              hasNewImages = foundUploadedImages.length >= expectedNewImageCount;
            }

            if (hasNewImages || attempts >= maxAttempts) {
              pollingActiveRef.current = false;
              if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current);
                pollingTimeoutRef.current = null;
              }

              // Clean up blob URLs
              placeholders.forEach((placeholder) => {
                if (placeholder.url && placeholder.url.startsWith("blob:")) {
                  URL.revokeObjectURL(placeholder.url);
                }
              });

              if (attempts < maxAttempts) {
                const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
                showToast(
                  "success",
                  "Sukces",
                  `${imageFiles.length} ${typeLabel} zostało przesłanych`
                );
              }

              if (config.onUploadComplete) {
                config.onUploadComplete();
              }

              if (config.type === "finals" && config.onOrderUpdated && config.orderId) {
                window.dispatchEvent(
                  new CustomEvent("orderUpdated", { detail: { orderId: config.orderId } })
                );
              }

              return;
            }

            if (pollingActiveRef.current) {
              pollingTimeoutRef.current = setTimeout(pollForImages, pollInterval);
            }
          } catch (err: any) {
            if (err?.status === 401 || err?.refreshFailed) {
              pollingActiveRef.current = false;
              if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current);
                pollingTimeoutRef.current = null;
              }

              // Clean up placeholders
              placeholders.forEach((placeholder) => {
                if (placeholder.url && placeholder.url.startsWith("blob:")) {
                  URL.revokeObjectURL(placeholder.url);
                }
              });

              if (config.loadOrderData) {
                try {
                  await config.loadOrderData();
                } catch (reloadErr) {
                  // Ignore
                }
              }

              return;
            }

            if (attempts < maxAttempts && pollingActiveRef.current) {
              pollingTimeoutRef.current = setTimeout(pollForImages, pollInterval);
            } else {
              pollingActiveRef.current = false;
              placeholders.forEach((placeholder) => {
                if (placeholder.url && placeholder.url.startsWith("blob:")) {
                  URL.revokeObjectURL(placeholder.url);
                }
              });
            }
          }
        };

        // Start polling after a short delay
        pollingTimeoutRef.current = setTimeout(
          pollForImages,
          config.type === "finals" ? 500 : 1000
        );
      } catch (err) {
        pollingActiveRef.current = false;
        if (pollingTimeoutRef.current) {
          clearTimeout(pollingTimeoutRef.current);
          pollingTimeoutRef.current = null;
        }

        // Clean up placeholders
        placeholders.forEach((placeholder) => {
          if (placeholder.url && placeholder.url.startsWith("blob:")) {
            URL.revokeObjectURL(placeholder.url);
          }
        });

        if (uploadCancelRef.current) {
          const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
          showToast("info", "Anulowano", `Przesyłanie ${typeLabel} zostało anulowane`);
        } else {
          const errorMsg = (err as Error)?.message || "Nie udało się przesłać zdjęć";
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
    [config, showToast, retryWithBackoff]
  );

  const cancelUpload = useCallback(() => {
    uploadCancelRef.current = true;
    pollingActiveRef.current = false;
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  return {
    handleFileSelect,
    uploading,
    uploadProgress,
    cancelUpload,
  };
}
