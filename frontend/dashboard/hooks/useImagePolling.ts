import { useRef, useCallback } from "react";

import { GalleryImage } from "../components/upload/PhotoUploadHandler";
import { PerImageProgress } from "../components/upload/UploadProgressOverlay";
import api from "../lib/api-service";
import { useGalleryStore } from "../store/gallerySlice";

import { useToast } from "./useToast";

export type UploadType = "originals" | "finals";

interface UseImagePollingConfig {
  galleryId: string;
  orderId?: string;
  type: UploadType;
  fileToKeyMap: Map<string, string>;
  updateProgress: (updater: (prev: PerImageProgress[]) => PerImageProgress[]) => void;
  getCurrentProgress: () => PerImageProgress[];
  onImagesUpdated: (images: GalleryImage[]) => void;
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

interface PollingParams {
  expectedNewImageCount: number;
  initialImageCount: number;
  uploadSuccesses: number;
}

export function useImagePolling(config: UseImagePollingConfig) {
  const { showToast } = useToast();
  const pollingActiveRef = useRef(false);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startPolling = useCallback(
    (params: PollingParams, onCancel?: () => boolean) => {
      const {
        expectedNewImageCount,
        initialImageCount,
        uploadSuccesses: capturedUploadSuccesses,
      } = params;
      const { fileToKeyMap } = config;
      let attempts = 0;
      const maxAttempts = 60;
      const pollInterval = 1000;
      pollingActiveRef.current = true;

      const pollForImages = async (): Promise<void> => {
        if (!pollingActiveRef.current || onCancel?.()) {
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
            // Use store action - checks cache first, fetches if needed
            const { fetchGalleryImages: fetchImages } = useGalleryStore.getState();
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            const apiImagesResult = await fetchImages(config.galleryId, true); // Force refresh for polling
            if (Array.isArray(apiImagesResult)) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              images = apiImagesResult as GalleryImage[];
            } else {
              images = [];
            }
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
          config.updateProgress((prev) => {
            return prev.map((progress) => {
              // Skip if already ready or error
              if (progress.status === "ready" || progress.status === "error") {
                return progress;
              }

              // Find matching API image by checking if the uploaded file's key matches
              const uploadedKey = fileToKeyMap.get(progress.fileName);
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
          });

          // Only notify parent when images are ready (have URLs)
          if (imagesWithUrls.length > 0) {
            config.onImagesUpdated(imagesWithUrls);
          }

          // Check if we have new images
          let hasNewImages = false;

          // Check if all uploaded images are ready (have URLs)
          // Use getCurrentProgress to get latest progress (state updates are async)
          const currentProgress = config.getCurrentProgress();
          const readyCount = currentProgress.filter((p) => p.status === "ready").length;
          const errorCount = currentProgress.filter((p) => p.status === "error").length;
          const allProcessed = readyCount + errorCount === expectedNewImageCount;

          if (config.type === "finals") {
            // For finals, check if we have enough images with URLs
            hasNewImages = imagesWithUrls.length >= initialImageCount + expectedNewImageCount;
          } else {
            // For originals, check if all images are processed (have URLs)
            hasNewImages =
              allProcessed && imagesWithUrls.length >= initialImageCount + expectedNewImageCount;
          }

          if (hasNewImages || attempts >= maxAttempts) {
            pollingActiveRef.current = false;
            if (pollingTimeoutRef.current) {
              clearTimeout(pollingTimeoutRef.current);
              pollingTimeoutRef.current = null;
            }

            // eslint-disable-next-line no-console
            console.log("[useImagePolling] Processing complete", {
              type: config.type,
              galleryId: config.galleryId,
              orderId: config.orderId,
              attempts,
              maxAttempts,
              hasNewImages,
              expectedNewImageCount,
              capturedUploadSuccesses,
              currentOriginalsBytes: useGalleryStore.getState().currentGallery?.originalsBytesUsed,
              currentFinalsBytes: useGalleryStore.getState().currentGallery?.finalsBytesUsed,
            });

            if (attempts < maxAttempts) {
              const typeLabel = config.type === "finals" ? "zdjęć finalnych" : "zdjęć";
              showToast(
                "success",
                "Sukces",
                `${expectedNewImageCount} ${typeLabel} zostało przesłanych`
              );
            }

            // For originals, validate limits AFTER all photos are processed
            // Note: Recalculation already happened after uploads complete (in PhotoUploadHandler)
            // Processing doesn't change storage size, so no need to recalculate again
            if (config.type === "originals" && capturedUploadSuccesses > 0) {
              // Wait a bit for backend to process images
              setTimeout(async () => {
                try {
                  // eslint-disable-next-line no-console
                  console.log("[useImagePolling] Validating upload limits for originals", {
                    galleryId: config.galleryId,
                  });
                  // Only validate limits if we need to check for excess (optimistic updates already handled UI)
                  // This prevents unnecessary API calls and flicker
                  const validationResult = await api.galleries.validateUploadLimits(
                    config.galleryId
                  );

                  if (!validationResult.withinLimit && validationResult.excessBytes !== undefined) {
                    // eslint-disable-next-line no-console
                    console.log("[useImagePolling] Upload limits exceeded", {
                      galleryId: config.galleryId,
                      excessBytes: validationResult.excessBytes,
                    });
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
                  // eslint-disable-next-line no-console
                  console.error("[useImagePolling] Failed to validate upload limits:", validationError);
                }
              }, 1000); // Wait for backend to finish processing
            }

            if (config.onUploadComplete) {
              // eslint-disable-next-line no-console
              console.log("[useImagePolling] Calling onUploadComplete callback", {
                type: config.type,
                galleryId: config.galleryId,
                orderId: config.orderId,
              });
              config.onUploadComplete();
            }

            // Store updates will trigger re-renders automatically via Zustand subscriptions

            return;
          }

          if (pollingActiveRef.current) {
            pollingTimeoutRef.current = setTimeout(pollForImages, pollInterval);
          }
        } catch (err: unknown) {
          const apiErr = err as { status?: number; refreshFailed?: boolean };
          // Stop polling on auth errors (401) or client errors (4xx) like 404 (gallery not found)
          if (apiErr?.status === 401 || apiErr?.refreshFailed || (apiErr?.status && apiErr.status >= 400 && apiErr.status < 500)) {
            pollingActiveRef.current = false;
            if (pollingTimeoutRef.current) {
              clearTimeout(pollingTimeoutRef.current);
              pollingTimeoutRef.current = null;
            }

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
          }
        }
      };

      // Start polling after a short delay
      pollingTimeoutRef.current = setTimeout(pollForImages, config.type === "finals" ? 500 : 1000);
    },
    [config, showToast]
  );

  const stopPolling = useCallback(() => {
    pollingActiveRef.current = false;
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  return { startPolling, stopPolling };
}
