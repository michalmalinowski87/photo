import { useState, useRef, useCallback } from "react";

import api, { formatApiError } from "../lib/api-service";
import { useGalleryStore } from "../store/gallerySlice";

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

  // Toast batching refs
  const successToastBatchRef = useRef<number>(0);
  const errorToastBatchRef = useRef<number>(0);
  const successToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

        // Save suppression only after successful deletion
        if (suppressChecked) {
          const suppressKey = "final_image_delete_confirm_suppress";
          const suppressUntil = Date.now() + 15 * 60 * 1000;
          localStorage.setItem(suppressKey, suppressUntil.toString());
        }

        // Optimistically remove image from list immediately after successful delete
        const imageSize = image.size || 0;
        let wasLastImage = false;

        setFinalImages((prevImages) => {
          const remainingImages = prevImages.filter(
            (img) => (img.key ?? img.filename) !== imageKey
          );
          wasLastImage = remainingImages.length === 0;

          // Clear optimistic state
          setOptimisticFinalsBytes(null);

          return remainingImages;
        });

        // Update Zustand store optimistically after state update (side panel will pull from here)
        // Do this after setState to avoid React warning about setState during render
        const { currentGallery, updateFinalsBytesUsed } = useGalleryStore.getState();
        if (currentGallery && imageSize > 0) {
          // Use requestAnimationFrame to schedule after current render cycle
          requestAnimationFrame(() => {
            updateFinalsBytesUsed(-imageSize);
          });
        }

        // If this was the last image, call /status endpoint
        if (wasLastImage) {
          void (async () => {
            try {
              await refreshOrderStatus(galleryIdStr, orderIdStr);
            } catch (statusErr) {
              // eslint-disable-next-line no-console
              console.error(
                "[useFinalImageDelete] Failed to refresh order status after last image deleted:",
                statusErr
              );
            }
          })();
        }

        // Remove from deleting set
        setDeletingImages((prev) => {
          const updated = new Set(prev);
          updated.delete(imageKey);
          return updated;
        });

        // Mark as successfully deleted
        setDeletedImageKeys((prev) => new Set(prev).add(imageKey));

        // Refresh bytes only (this will update Zustand store with actual server value)
        const { refreshGalleryBytesOnly } = useGalleryStore.getState();
        void refreshGalleryBytesOnly(galleryIdStr, true); // forceRecalc = true

        // Clear deleted key after 30 seconds to allow eventual consistency
        setTimeout(() => {
          setDeletedImageKeys((prev) => {
            const updated = new Set(prev);
            updated.delete(imageKey);
            return updated;
          });
        }, 30000);

        // Batch success toasts - accumulate count and show single toast
        successToastBatchRef.current += 1;

        // If there's already a pending toast, don't reset the timeout, just increment count
        if (!successToastTimeoutRef.current) {
          // Only set timeout if one doesn't exist
          successToastTimeoutRef.current = setTimeout(() => {
            const count = successToastBatchRef.current;
            successToastBatchRef.current = 0;
            successToastTimeoutRef.current = null;
            if (count === 1) {
              showToast("success", "Sukces", "Zdjęcie zostało usunięte");
            } else {
              showToast("success", "Sukces", `${count} zdjęć zostało usuniętych`);
            }
          }, 800); // Increased debounce window to catch rapid deletions
        }
      } catch (err) {
        // On error, image is already in the list (we didn't remove it), just remove deleting state
        // No optimistic update was applied yet, so no need to revert

        // Remove from deleting set
        setDeletingImages((prev) => {
          const updated = new Set(prev);
          updated.delete(imageKey);
          return updated;
        });

        // Batch error toasts - accumulate count and show single toast
        errorToastBatchRef.current += 1;
        const errorMessage = formatApiError(err);

        // If there's already a pending toast, don't reset the timeout, just increment count
        if (!errorToastTimeoutRef.current) {
          // Only set timeout if one doesn't exist
          errorToastTimeoutRef.current = setTimeout(() => {
            const count = errorToastBatchRef.current;
            errorToastBatchRef.current = 0;
            errorToastTimeoutRef.current = null;
            if (count === 1) {
              showToast("error", "Błąd", errorMessage);
            } else {
              showToast("error", "Błąd", `Nie udało się usunąć ${count} zdjęć`);
            }
          }, 800); // Increased debounce window to catch rapid deletions
        }
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
