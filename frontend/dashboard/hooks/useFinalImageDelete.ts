import { useState, useRef, useCallback } from "react";

import api, { formatApiError } from "../lib/api-service";
import { useGalleryStore } from "../store/gallerySlice";
import { useOrderStore } from "../store/orderSlice";

import { useOrderStatusRefresh } from "./useOrderStatusRefresh";
import { useToast } from "./useToast";

interface GalleryImage {
  key?: string;
  filename?: string;
  size?: number;
  [key: string]: unknown;
}

interface UseFinalImageDeleteOptions {
  galleryId: string | string[] | undefined;
  orderId: string | string[] | undefined;
  setFinalImages: React.Dispatch<React.SetStateAction<GalleryImage[]>>;
  setOptimisticFinalsBytes: React.Dispatch<React.SetStateAction<number | null>>;
}

export const useFinalImageDelete = ({
  galleryId,
  orderId,
  setFinalImages,
  setOptimisticFinalsBytes,
}: UseFinalImageDeleteOptions) => {
  const { showToast } = useToast();
  const { refreshOrderStatus } = useOrderStatusRefresh();
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set());
  const [deletedImageKeys, setDeletedImageKeys] = useState<Set<string>>(new Set());
  const deletingImagesRef = useRef<Set<string>>(new Set());
  const deletedImageKeysRef = useRef<Set<string>>(new Set());

  // Sync refs with state
  deletingImagesRef.current = deletingImages;
  deletedImageKeysRef.current = deletedImageKeys;

  const deleteImage = useCallback(
    async (image: GalleryImage, suppressChecked?: boolean): Promise<void> => {
      const imageKey = image.key ?? image.filename;
      if (!imageKey || !galleryId || !orderId) {
        return;
      }

      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
      const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;

      if (!galleryIdStr || !orderIdStr) {
        return;
      }

      // Prevent duplicate deletions
      if (deletingImages.has(imageKey)) {
        return;
      }

      // Mark image as being deleted (keep it visible with deleting state)
      setDeletingImages((prev) => new Set(prev).add(imageKey));

      // Don't remove image from list yet - keep it visible with "deleting" overlay
      // Image will be removed after deletion completes and status/bytes are refreshed

      try {
        await api.orders.deleteFinalImage(galleryIdStr, orderIdStr, imageKey);

        // Invalidate all caches to ensure fresh data on next fetch
        const { invalidateAllGalleryCaches } = useGalleryStore.getState();
        invalidateAllGalleryCaches(galleryIdStr);

        // Save suppression only after successful deletion
        if (suppressChecked) {
          const suppressKey = "final_image_delete_confirm_suppress";
          const suppressUntil = Date.now() + 15 * 60 * 1000;
          localStorage.setItem(suppressKey, suppressUntil.toString());
        }

        // Poll for deletion completion - check when image is actually deleted from S3
        // No optimistic update here - bytes will update only after S3 deletion is confirmed
        // The "deleting" overlay provides user feedback during deletion
        const pollForDeletion = async (): Promise<void> => {
          // Small initial delay to give Lambda a moment to start processing
          await new Promise((resolve) => setTimeout(resolve, 500));

          const maxAttempts = 30; // Max 30 seconds (1 second intervals)
          const pollInterval = 1000; // Poll every 1 second
          let attempts = 0;

          while (attempts < maxAttempts) {
            attempts++;

            try {
              // Check if image still exists in the API
              const finalResponse = await api.orders.getFinalImages(galleryIdStr, orderIdStr);
              const images = finalResponse.images ?? [];
              const imageStillExists = images.some(
                (img: GalleryImage) => (img.key ?? img.filename) === imageKey
              );

              if (!imageStillExists) {
                // Image is gone from S3! Deletion is complete
                // Don't apply optimistic update here - we refresh immediately after
                // This prevents conflicts with concurrent deletions and ensures accuracy
                // The refresh will update bytes with the correct server-side value

                break;
              }
            } catch (pollErr) {
              // If polling fails, log but continue (might be temporary network issue)
              // eslint-disable-next-line no-console
              console.warn("[useFinalImageDelete] Poll check failed, retrying...", pollErr);
            }

            // Wait before next poll attempt
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          }

          if (attempts >= maxAttempts) {
            // eslint-disable-next-line no-console
            console.warn(
              `[useFinalImageDelete] Polling timed out after ${maxAttempts} attempts for ${imageKey}`
            );
          }

          // Now that deletion is confirmed (or timed out), refresh bytes and status
          const { refreshGalleryBytesOnly } = useGalleryStore.getState();
          await refreshGalleryBytesOnly(galleryIdStr, true); // forceRecalc = true

          // Clear optimistic state after bytes are refreshed with actual values
          setOptimisticFinalsBytes(null);

          // Refresh order status to update delivery status
          try {
            await refreshOrderStatus(galleryIdStr, orderIdStr);
          } catch (statusErr) {
            // eslint-disable-next-line no-console
            console.error(
              "[STATUS_UPDATE] deleteImage - Failed to refresh order status",
              statusErr
            );
          }

          // Now that deletion is complete and bytes/status are refreshed, remove from UI
          // Mark as successfully deleted to prevent reappearance
          setDeletedImageKeys((prev) => new Set(prev).add(imageKey));

          // Remove from deleting set
          setDeletingImages((prev) => {
            const updated = new Set(prev);
            updated.delete(imageKey);
            return updated;
          });

          // Remove image from list now that deletion is complete
          setFinalImages((prevImages) =>
            prevImages.filter((img) => (img.key ?? img.filename) !== imageKey)
          );

          // Clear deleted key after 30 seconds to allow eventual consistency
          setTimeout(() => {
            setDeletedImageKeys((prev) => {
              const updated = new Set(prev);
              updated.delete(imageKey);
              return updated;
            });
          }, 30000);
        };

        // Start polling for deletion completion (non-blocking)
        void pollForDeletion();

        showToast("success", "Sukces", "Zdjęcie zostało usunięte");
      } catch (err) {
        // On error, image is already in the list (we didn't remove it), just remove deleting state
        // No optimistic update was applied yet, so no need to revert

        // Remove from deleting set
        setDeletingImages((prev) => {
          const updated = new Set(prev);
          updated.delete(imageKey);
          return updated;
        });

        showToast("error", "Błąd", formatApiError(err));
        throw err;
      }
    },
    [
      galleryId,
      orderId,
      setFinalImages,
      setOptimisticFinalsBytes,
      deletingImages,
      deletedImageKeys,
      refreshOrderStatus,
      showToast,
    ]
  );

  const handleDeleteImageClick = useCallback(
    (image: GalleryImage): GalleryImage | null => {
      const imageKey = image.key ?? image.filename;

      if (!imageKey) {
        return null;
      }

      // Prevent deletion if already being deleted
      if (deletingImages.has(imageKey)) {
        return null;
      }

      // Check if deletion confirmation is suppressed
      const suppressKey = "final_image_delete_confirm_suppress";
      const suppressUntil = localStorage.getItem(suppressKey);
      if (suppressUntil) {
        const suppressUntilTime = parseInt(suppressUntil, 10);
        if (Date.now() < suppressUntilTime) {
          // Suppression is still active, proceed directly with deletion
          void deleteImage(image);
          return null;
        } else {
          // Suppression expired, remove it
          localStorage.removeItem(suppressKey);
        }
      }

      // Return image to show in confirmation dialog
      return image;
    },
    [deleteImage, deletingImages]
  );

  return {
    deleteImage,
    handleDeleteImageClick,
    deletingImages,
    deletedImageKeys,
    deletingImagesRef,
    deletedImageKeysRef,
  };
};
