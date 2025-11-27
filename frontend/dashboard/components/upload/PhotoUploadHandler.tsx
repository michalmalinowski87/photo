import { useState, useRef, useCallback } from "react";

import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";
import { requestThrottler } from "../../lib/requestThrottler";

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
  const [isUploadComplete, setIsUploadComplete] = useState(false); // Track when upload phase is done (now processing)
  const perImageProgressRef = useRef<PerImageProgress[]>([]); // Ref to track progress for closures
  const uploadCancelRef = useRef(false);
  const pollingActiveRef = useRef(false);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileToKeyMapRef = useRef<Map<string, string>>(new Map()); // Map filename to API key

  // Helper function to retry a request with exponential backoff and jitter
  const retryWithBackoff = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      maxRetries: number = 5,
      baseDelay: number = 500
    ): Promise<T> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          if (attempt === maxRetries - 1) {
            throw error;
          }
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
      setIsUploadComplete(false); // Reset upload complete flag
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
      perImageProgressRef.current = initialProgress; // Update ref
      config.onPerImageProgress?.(initialProgress);
      fileToKeyMapRef.current.clear();

      try {
        // Optimized batch processing: Get presigned URLs in batches to reduce API Gateway load
        const PRESIGN_BATCH_SIZE = 20; // Get 20 presigned URLs per API call (max 50)
        const UPLOAD_CONCURRENCY = 5; // Upload 5 files concurrently to S3
        const uploadErrors: Array<{ file: string; error: string }> = [];
        let uploadSuccesses = 0;

        // Step 1: Get all presigned URLs in batches (reduces API Gateway calls significantly)
        const presignedUrlMap = new Map<string, { url: string; apiKey: string }>();

        for (let i = 0; i < imageFiles.length; i += PRESIGN_BATCH_SIZE) {
          if (uploadCancelRef.current) {
            throw new Error("Upload cancelled by user");
          }

          const batch = imageFiles.slice(i, i + PRESIGN_BATCH_SIZE);

          try {
            // Use throttler to rate-limit API requests
            let batchPresignResponse: {
              urls: Array<{ key: string; url: string; objectKey: string }>;
            };

            if (config.type === "finals") {
              // Finals upload - batch endpoint
              batchPresignResponse = await requestThrottler.throttle(() =>
                retryWithBackoff(async () => {
                  return await api.uploads.getFinalImagePresignedUrlsBatch(
                    config.galleryId,
                    config.orderId ?? "",
                    {
                      files: batch.map((file) => ({
                        key: file.name,
                        contentType: file.type || "image/jpeg",
                      })),
                    }
                  );
                })
              );
            } else {
              // Originals upload - batch endpoint
              const timestamp = Date.now();
              batchPresignResponse = await requestThrottler.throttle(() =>
                retryWithBackoff(async () => {
                  return await api.uploads.getPresignedUrlsBatch({
                    galleryId: config.galleryId,
                    files: batch.map((file, idx) => {
                      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
                      // Use microsecond precision to avoid collisions
                      const uniqueTimestamp = timestamp + idx;
                      return {
                        key: `originals/${uniqueTimestamp}_${sanitizedFilename}`,
                        contentType: file.type || "image/jpeg",
                        fileSize: file.size,
                      };
                    }),
                  });
                })
              );
            }

            // Map presigned URLs to files
            batch.forEach((file, idx) => {
              const presignedUrl = batchPresignResponse.urls[idx];
              if (presignedUrl) {
                // Extract API key from objectKey (remove galleries/{galleryId}/ prefix)
                const apiKey = presignedUrl.objectKey.replace(`galleries/${config.galleryId}/`, "");
                presignedUrlMap.set(file.name, { url: presignedUrl.url, apiKey });
                fileToKeyMapRef.current.set(file.name, apiKey);
              }
            });
          } catch (error) {
            // If batch presign fails, add all files in batch to errors
            batch.forEach((file) => {
              const errorMessage = (error as Error).message || "Failed to get presigned URL";
              uploadErrors.push({ file: file.name, error: errorMessage });
            });
          }

          // Small delay between presign batches to avoid overwhelming API Gateway
          if (i + PRESIGN_BATCH_SIZE < imageFiles.length && !uploadCancelRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms delay between batches
          }
        }

        // Step 2: Upload files to S3 in concurrent batches
        for (let i = 0; i < imageFiles.length; i += UPLOAD_CONCURRENCY) {
          if (uploadCancelRef.current) {
            throw new Error("Upload cancelled by user");
          }

          const batch = imageFiles.slice(i, i + UPLOAD_CONCURRENCY);

          // Process batch with individual error handling
          await Promise.allSettled(
            batch.map(async (file, batchIndex) => {
              const globalIndex = i + batchIndex;

              // Check for cancellation before each file
              if (uploadCancelRef.current) {
                throw new Error("Upload cancelled");
              }

              // Update overall progress
              setUploadProgress((prev) => ({
                ...prev,
                current: globalIndex + 1,
                currentFileName: file.name,
              }));

              // Update per-image progress to uploading
              setPerImageProgress((prev) => {
                const updated = prev.map((p) =>
                  p.fileName === file.name
                    ? { ...p, status: "uploading" as const, uploadProgress: 0 }
                    : p
                );
                config.onPerImageProgress?.(updated);
                return updated;
              });

              try {
                const presignedData = presignedUrlMap.get(file.name);
                if (!presignedData) {
                  throw new Error("Presigned URL not found for file");
                }

                // Upload file to S3 with progress tracking
                const uploadController = new AbortController();
                const uploadTimeout = setTimeout(() => uploadController.abort(), 300000); // 5 min timeout

                try {
                  // Track upload progress using XMLHttpRequest for progress events
                  const uploadPromise = new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();

                    xhr.upload.addEventListener("progress", (e) => {
                      if (e.lengthComputable) {
                        const percentComplete = Math.min((e.loaded / e.total) * 100, 100);
                        setPerImageProgress((prev) => {
                          const updated = prev.map((p) =>
                            p.fileName === file.name ? { ...p, uploadProgress: percentComplete } : p
                          );
                          perImageProgressRef.current = updated; // Update ref
                          config.onPerImageProgress?.(updated);
                          return updated;
                        });
                      }
                    });

                    xhr.addEventListener("load", () => {
                      if (xhr.status >= 200 && xhr.status < 300) {
                        // Ensure progress is 100% on completion
                        setPerImageProgress((prev) => {
                          const updated = prev.map((p) =>
                            p.fileName === file.name ? { ...p, uploadProgress: 100 } : p
                          );
                          perImageProgressRef.current = updated;
                          config.onPerImageProgress?.(updated);
                          return updated;
                        });
                        resolve();
                      } else {
                        reject(
                          new Error(
                            `Failed to upload ${file.name}: ${xhr.status} ${xhr.statusText}`
                          )
                        );
                      }
                    });

                    xhr.addEventListener("error", () => {
                      reject(new Error(`Network error uploading ${file.name}`));
                    });

                    xhr.addEventListener("abort", () => {
                      reject(new Error(`Upload cancelled for ${file.name}`));
                    });

                    xhr.open("PUT", presignedData.url);
                    xhr.setRequestHeader("Content-Type", file.type || "image/jpeg");
                    xhr.send(file);
                  });

                  await uploadPromise;
                  clearTimeout(uploadTimeout);

                  // Update per-image progress to processing
                  setPerImageProgress((prev) => {
                    const updated = prev.map((p) =>
                      p.fileName === file.name
                        ? { ...p, status: "processing" as const, uploadProgress: 100 }
                        : p
                    );
                    perImageProgressRef.current = updated; // Update ref
                    config.onPerImageProgress?.(updated);
                    return updated;
                  });

                  uploadSuccesses++;
                  return { success: true, file: file.name, key: presignedData.apiKey };
                } catch (uploadError) {
                  clearTimeout(uploadTimeout);
                  throw uploadError;
                }
              } catch (error) {
                const errorMessage = (error as Error).message || "Unknown error";
                uploadErrors.push({ file: file.name, error: errorMessage });

                // Update per-image progress to error
                setPerImageProgress((prev) => {
                  const updated = prev.map((p) =>
                    p.fileName === file.name
                      ? { ...p, status: "error" as const, error: errorMessage }
                      : p
                  );
                  perImageProgressRef.current = updated; // Update ref
                  config.onPerImageProgress?.(updated);
                  return updated;
                });

                return { success: false, file: file.name, error: errorMessage };
              }
            })
          );

          // Update progress with batch results
          setUploadProgress((prev) => ({
            ...prev,
            successes: uploadSuccesses,
            errors: uploadErrors,
          }));

          // Small delay between batches to avoid overwhelming the server
          if (i + UPLOAD_CONCURRENCY < imageFiles.length && !uploadCancelRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }

        // Final progress update - upload phase complete
        setUploadProgress((prev) => ({
          ...prev,
          current: imageFiles.length,
          currentFileName: "",
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
          } else {
            // Validate upload limits for originals (but don't reload gallery yet - wait for polling to complete)
            if (uploadSuccesses > 0) {
              // Store validation callback to run after polling completes
              // We'll validate and reload after images appear
            }
          }
        }

        // Poll for images to appear on CloudFront
        // Capture variables for closure
        const expectedNewImageCount = imageFiles.length;
        const capturedInitialImageCount = initialImageCount;
        const capturedUploadSuccesses = uploadSuccesses;
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
              const finalResponse = await api.orders.getFinalImages(
                config.galleryId,
                config.orderId ?? ""
              );
              // Preserve all URL properties (previewUrl, thumbUrl, finalUrl) for finals
              images = (finalResponse.images ?? []) as GalleryImage[];
            } else {
              const photosResponse = await api.galleries.getImages(config.galleryId);
              images = (photosResponse?.images ?? []) as GalleryImage[];
            }

            // Filter out deleted images
            const validApiImages = images.filter((img: GalleryImage) => {
              const imgKey = img.key ?? img.filename;
              if (!imgKey) {
                return false;
              }
              if (config.deletingImagesRef?.current.has(imgKey)) {
                return false;
              }
              if (config.deletedImageKeysRef?.current.has(imgKey)) {
                return false;
              }
              return true;
            });

            // For originals, only consider images with URLs (processed)
            // For finals, check for previewUrl/thumbUrl (processed) or finalUrl (original)
            const imagesWithUrls =
              config.type === "originals"
                ? validApiImages.filter((img) => !!(img.thumbUrl ?? img.previewUrl ?? img.url))
                : validApiImages.filter(
                    (img) => !!(img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url)
                  );

            // Update per-image progress: mark images as ready when they appear with URLs
            setPerImageProgress((prev) => {
              const updated = prev.map((progress) => {
                // Skip if already ready or error
                if (progress.status === "ready" || progress.status === "error") {
                  return progress;
                }

                // Find matching API image by checking if the uploaded file's key matches
                const uploadedKey = fileToKeyMapRef.current.get(progress.fileName);
                const matchingImage = imagesWithUrls.find((img) => {
                  const imgKey = img.key ?? img.filename;
                  if (!imgKey) {
                    return false;
                  }

                  // For originals: API key format is "originals/{timestamp}_{filename}"
                  // For finals: API key format is just the filename
                  if (config.type === "originals") {
                    // Match by checking if API key ends with filename, or if uploadedKey matches
                    return (
                      imgKey === uploadedKey ||
                      imgKey.endsWith(progress.fileName) ||
                      (uploadedKey && imgKey.includes(uploadedKey.split("/").pop() ?? ""))
                    );
                  } else {
                    // For finals, match by filename directly
                    return imgKey === progress.fileName || imgKey === uploadedKey;
                  }
                });

                if (matchingImage) {
                  return { ...progress, status: "ready" as const };
                }
                return progress;
              });
              perImageProgressRef.current = updated; // Update ref
              config.onPerImageProgress?.(updated);
              return updated;
            });

            // Only notify parent when images are ready (have URLs)
            if (imagesWithUrls.length > 0) {
              config.onImagesUpdated(imagesWithUrls);
            }

            // Check if we have new images
            let hasNewImages = false;

            // Check if all uploaded images are ready (have URLs)
            // Use ref to get latest progress (state updates are async)
            const currentProgress = perImageProgressRef.current;
            const readyCount = currentProgress.filter((p) => p.status === "ready").length;
            const errorCount = currentProgress.filter((p) => p.status === "error").length;
            const allProcessed = readyCount + errorCount === expectedNewImageCount;

            if (config.type === "finals") {
              // For finals, check if we have enough images with URLs
              hasNewImages =
                imagesWithUrls.length >= capturedInitialImageCount + expectedNewImageCount;
            } else {
              // For originals, check if all images are processed (have URLs)
              hasNewImages =
                allProcessed &&
                imagesWithUrls.length >= capturedInitialImageCount + expectedNewImageCount;
            }

            if (hasNewImages || attempts >= maxAttempts) {
              pollingActiveRef.current = false;
              if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current);
                pollingTimeoutRef.current = null;
              }

              // All images processed - no cleanup needed (no placeholders)

              if (attempts < maxAttempts) {
                const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
                showToast(
                  "success",
                  "Sukces",
                  `${imageFiles.length} ${typeLabel} zostało przesłanych`
                );
              }

              // For originals, validate limits and reload gallery AFTER polling completes
              if (
                config.type === "originals" &&
                capturedUploadSuccesses > 0 &&
                config.reloadGallery
              ) {
                // Wait a bit for backend to process images and update originalsBytesUsed
                setTimeout(async () => {
                  try {
                    const validationResult = await api.galleries.validateUploadLimits(
                      config.galleryId
                    );

                    if (
                      !validationResult.withinLimit &&
                      validationResult.excessBytes !== undefined
                    ) {
                      config.onValidationNeeded?.({
                        uploadedSizeBytes: validationResult.uploadedSizeBytes,
                        originalsLimitBytes: validationResult.originalsLimitBytes ?? 0,
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

                  // Reload gallery to update byte usage
                  if (config.reloadGallery) {
                    await config.reloadGallery();
                  }
                }, 2000);
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
          } catch (err: unknown) {
            const apiErr = err as { status?: number; refreshFailed?: boolean };
            if (apiErr?.status === 401 || apiErr?.refreshFailed) {
              pollingActiveRef.current = false;
              if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current);
                pollingTimeoutRef.current = null;
              }

              // No placeholders to clean up

              if (config.loadOrderData) {
                try {
                  await config.loadOrderData();
                } catch (_reloadErr) {
                  // Ignore
                }
              }

              return;
            }

            if (attempts < maxAttempts && pollingActiveRef.current) {
              pollingTimeoutRef.current = setTimeout(pollForImages, pollInterval);
            } else {
              pollingActiveRef.current = false;
              // No placeholders to clean up
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

        // No placeholders to clean up

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
    perImageProgress,
    isUploadComplete,
    cancelUpload,
  };
}
