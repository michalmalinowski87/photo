import { useState, useRef, useCallback } from "react";

import api, { formatApiError } from "../lib/api-service";
import {
  applyOptimisticUpdate,
  calculateSizeDelta,
  revertOptimisticUpdate,
} from "../lib/optimistic-updates";
import { useGalleryStore } from "../store/gallerySlice";
import { useOrderStore } from "../store/orderSlice";
import { useToast } from "./useToast";
import { useOrderStatusRefresh } from "./useOrderStatusRefresh";

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

      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : (galleryId);
      const orderIdStr = Array.isArray(orderId) ? orderId[0] : (orderId);

      if (!galleryIdStr || !orderIdStr) {
        return;
      }

      // Prevent duplicate deletions
      if (deletingImages.has(imageKey)) {
        return;
      }

      // Mark image as being deleted
      setDeletingImages((prev) => new Set(prev).add(imageKey));

      // Optimistically remove image from local state immediately
      setFinalImages((prevImages) =>
        prevImages.filter((img) => (img.key ?? img.filename) !== imageKey)
      );

      // Get image size for optimistic update
      const imageSize = image.size ?? 0;
      const sizeDelta = calculateSizeDelta(imageSize, true); // true = deletion

      // Apply optimistic update immediately (before API call)
      if (sizeDelta !== undefined && galleryIdStr) {
        const currentFinalsBytes = useGalleryStore.getState().currentGallery?.finalsBytesUsed;
        // eslint-disable-next-line no-console
        console.log("[orderDetail.tsx] deleteImage - Before optimistic update", {
          currentFinalsBytes,
          sizeDelta,
          expectedNewValue: (currentFinalsBytes ?? 0) + sizeDelta,
        });
        applyOptimisticUpdate({
          type: "finals",
          galleryId: galleryIdStr,
          sizeDelta,
          setOptimisticFinalsBytes,
          logContext: "useFinalImageDelete deleteImage",
        });
      }

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

        // Mark as successfully deleted to prevent reappearance
        setDeletedImageKeys((prev) => new Set(prev).add(imageKey));

        // Clear deleted key after 30 seconds to allow eventual consistency
        setTimeout(() => {
          setDeletedImageKeys((prev) => {
            const updated = new Set(prev);
            updated.delete(imageKey);
            return updated;
          });
        }, 30000);

        // Remove from deleting set and refresh bytes after async delete completes
        setDeletingImages((prev) => {
          const updated = new Set(prev);
          updated.delete(imageKey);
          // Refresh after every deletion (not just the last one) to catch status changes
          if (prev.size > 0 && updated.size < prev.size) {
            // Wait a bit for batch delete Lambda to process (async deletion)
            setTimeout(async () => {
              const { refreshGalleryBytesOnly } = useGalleryStore.getState();
              // Wait 2 seconds for batch delete Lambda to finish processing
              await new Promise((resolve) => setTimeout(resolve, 2000));
              await refreshGalleryBytesOnly(galleryIdStr, true); // forceRecalc = true

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
            }, 0);
          }
          return updated;
        });

        showToast("success", "Sukces", "Zdjęcie zostało usunięte");
      } catch (err) {
        // Revert optimistic update on error
        if (sizeDelta !== undefined && galleryIdStr) {
          revertOptimisticUpdate({
            type: "finals",
            galleryId: galleryIdStr,
            sizeDelta,
            setOptimisticFinalsBytes,
            logContext: "useFinalImageDelete deleteImage",
          });
        }

        // On error, restore the image to the list (only if not in deletedImageKeys)
        if (!deletedImageKeys.has(imageKey)) {
          setFinalImages((prevImages) => {
            const restored = [...prevImages];
            restored.push(image);
            return restored;
          });
        }

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

