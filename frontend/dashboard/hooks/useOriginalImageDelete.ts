import { useState, useRef, useCallback } from "react";

import api, { formatApiError } from "../lib/api-service";
import { useGalleryStore } from "../store/gallerySlice";

import { useToast } from "./useToast";

interface GalleryImage {
  key?: string;
  filename?: string;
  size?: number;
  [key: string]: unknown;
}

interface UseOriginalImageDeleteOptions {
  galleryId: string | string[] | undefined;
  setImages: React.Dispatch<React.SetStateAction<GalleryImage[]>>;
}

export const useOriginalImageDelete = ({ galleryId, setImages }: UseOriginalImageDeleteOptions) => {
  const { showToast } = useToast();
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
      if (!imageKey || !galleryId) {
        return;
      }

      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;

      if (!galleryIdStr) {
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
        await api.galleries.deleteImage(galleryIdStr, imageKey);

        // Save suppression only after successful deletion
        if (suppressChecked) {
          const suppressKey = "original_image_delete_confirm_suppress";
          const suppressUntil = Date.now() + 15 * 60 * 1000;
          localStorage.setItem(suppressKey, suppressUntil.toString());
        }

        // Optimistically remove image from list immediately after successful delete
        setImages((prevImages) => {
          const remainingImages = prevImages.filter((img) => (img.key ?? img.filename) !== imageKey);
          
          // Check if this was the last image - if so, we need to call /status
          const wasLastImage = remainingImages.length === 0;
          
          // Update Zustand store optimistically (side panel will pull from here)
          const { currentGallery, updateOriginalsBytesUsed } = useGalleryStore.getState();
          if (currentGallery && image.size) {
            // Optimistically subtract the image size
            updateOriginalsBytesUsed(-(image.size || 0));
          }
          
          // If this was the last image, call /status endpoint to update gallery state
          if (wasLastImage) {
            void (async () => {
              try {
                const { refreshGalleryStatusOnly } = useGalleryStore.getState();
                await refreshGalleryStatusOnly(galleryIdStr);
              } catch (statusErr) {
                // eslint-disable-next-line no-console
                console.error("[useOriginalImageDelete] Failed to refresh status after last image deleted:", statusErr);
              }
            })();
          }
          
          return remainingImages;
        });

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

        // Batch success toasts
        successToastBatchRef.current += 1;
        if (successToastTimeoutRef.current) {
          clearTimeout(successToastTimeoutRef.current);
        }
        successToastTimeoutRef.current = setTimeout(() => {
          const count = successToastBatchRef.current;
          successToastBatchRef.current = 0;
          if (count === 1) {
            showToast("success", "Sukces", "Zdjęcie zostało usunięte");
          } else {
            showToast("success", "Sukces", `${count} zdjęć zostało usuniętych`);
          }
        }, 500);
      } catch (err) {
        // On error, image is already in the list (we didn't remove it), just remove deleting state
        // No optimistic update was applied yet, so no need to revert

        // Remove from deleting set
        setDeletingImages((prev) => {
          const updated = new Set(prev);
          updated.delete(imageKey);
          return updated;
        });

        // Batch error toasts
        errorToastBatchRef.current += 1;
        const errorMessage = formatApiError(err);
        if (errorToastTimeoutRef.current) {
          clearTimeout(errorToastTimeoutRef.current);
        }
        errorToastTimeoutRef.current = setTimeout(() => {
          const count = errorToastBatchRef.current;
          errorToastBatchRef.current = 0;
          if (count === 1) {
            showToast("error", "Błąd", errorMessage);
          } else {
            showToast("error", "Błąd", `Nie udało się usunąć ${count} zdjęć`);
          }
        }, 500);
        throw err;
      }
    },
    [galleryId, setImages, deletingImages, showToast]
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
      const suppressKey = "original_image_delete_confirm_suppress";
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
