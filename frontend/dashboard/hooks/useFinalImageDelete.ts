import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useDeleteFinalImage } from "./mutations/useOrderMutations";
import { formatApiError } from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { GalleryImage } from "../types";

import { useToast } from "./useToast";

interface UseFinalImageDeleteOptions {
  galleryId: string | string[] | undefined;
  orderId: string | string[] | undefined;
  setFinalImages?: React.Dispatch<React.SetStateAction<GalleryImage[]>>;
  setOptimisticFinalsBytes: React.Dispatch<React.SetStateAction<number | null>>;
}

export const useFinalImageDelete = ({
  galleryId,
  orderId,
  setFinalImages,
  setOptimisticFinalsBytes,
}: UseFinalImageDeleteOptions) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const deleteFinalImageMutation = useDeleteFinalImage();

  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
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

      // The mutation's onMutate handles optimistic updates in React Query cache
      // No need for manual setFinalImages update - components will sync from React Query

      try {
        await deleteFinalImageMutation.mutateAsync({
          galleryId: galleryIdStr,
          orderId: orderIdStr,
          imageKeys: [imageKey],
        });

        // Save suppression only after successful deletion
        if (suppressChecked) {
          const suppressKey = "final_image_delete_confirm_suppress";
          const suppressUntil = Date.now() + 15 * 60 * 1000;
          localStorage.setItem(suppressKey, suppressUntil.toString());
        }

        // Clear optimistic bytes state
        setOptimisticFinalsBytes(null);

        // Check if this was the last image by querying cache (after optimistic update)
        // The mutation's onMutate already optimistically removed the image from cache
        const currentImages = queryClient.getQueryData<any[]>(
          queryKeys.orders.finalImages(galleryIdStr, orderIdStr)
        );
        const wasLastImage = !currentImages || currentImages.length === 0;

        // If this was the last image, invalidate order query to refresh status
        // The mutation's onSuccess already invalidates finalImages, so we just need to invalidate order
        if (wasLastImage && galleryIdStr && orderIdStr) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.orders.detail(galleryIdStr, orderIdStr),
          });
        }

        // Remove from deleting set - deletion is complete (synchronous)
        setDeletingImages((prev) => {
          const updated = new Set(prev);
          updated.delete(imageKey);
          return updated;
        });

        // Mark as successfully deleted
        // The mutation's optimistic update already removed it from cache, and onSuccess invalidates
        // queries to refetch. We track deletedImageKeys to filter it out in case it reappears
        // during refetch before the backend fully processes the deletion.
        setDeletedImageKeys((prev) => new Set(prev).add(imageKey));

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
        // On error, the mutation's onError will rollback React Query cache
        // Components will automatically sync from the rolled-back cache

        // Remove from deleting set on error
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
      setOptimisticFinalsBytes,
      deletingImages,
      queryClient,
      galleryIdStr,
      orderIdStr,
      showToast,
      deleteFinalImageMutation,
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

  // Clear deletedImageKeys for images that have been re-uploaded
  const clearDeletedKeysForImages = useCallback((imageKeys: string[]) => {
    setDeletedImageKeys((prev) => {
      const updated = new Set(prev);
      imageKeys.forEach((key) => updated.delete(key));
      return updated;
    });
  }, []);

  return {
    deleteImage,
    handleDeleteImageClick,
    deletingImages,
    deletedImageKeys,
    deletingImagesRef,
    deletedImageKeysRef,
    clearDeletedKeysForImages,
  };
};
