import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useDeleteGalleryImage } from "./mutations/useGalleryMutations";
import { formatApiError } from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { GalleryImage } from "../types";

import { useToast } from "./useToast";

interface UseOriginalImageDeleteOptions {
  galleryId: string | string[] | undefined;
}

export const useOriginalImageDelete = ({ galleryId }: UseOriginalImageDeleteOptions) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const deleteGalleryImageMutation = useDeleteGalleryImage();
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set());
  const [deletedImageKeys, setDeletedImageKeys] = useState<Set<string>>(new Set());

  // Toast batching refs
  const successToastBatchRef = useRef<number>(0);
  const errorToastBatchRef = useRef<number>(0);
  const successToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

      // React Query optimistic update in mutation's onMutate handles cache update
      try {
        await deleteGalleryImageMutation.mutateAsync({
          galleryId: galleryIdStr,
          imageKey,
        });

        // Save suppression only after successful deletion
        if (suppressChecked) {
          const suppressKey = "original_image_delete_confirm_suppress";
          const suppressUntil = Date.now() + 15 * 60 * 1000;
          localStorage.setItem(suppressKey, suppressUntil.toString());
        }

        // Check if this was the last image - if so, we need to invalidate gallery queries
        const currentImages = queryClient.getQueryData<any[]>(
          queryKeys.galleries.images(galleryIdStr, "thumb")
        );
        const wasLastImage = !currentImages || currentImages.length === 0;

        // If this was the last image, invalidate status query to refresh gallery state
        // Do NOT invalidate galleries.detail as it would invalidate child queries (images) causing refetch
        if (wasLastImage && galleryIdStr) {
          void (async () => {
            try {
              // Only invalidate status, not detail (which would invalidate images)
              await queryClient.invalidateQueries({
                queryKey: queryKeys.galleries.status(galleryIdStr),
              });
            } catch (statusErr) {
              // eslint-disable-next-line no-console
              console.error(
                "[useOriginalImageDelete] Failed to refresh status after last image deleted:",
                statusErr
              );
            }
          })();
        }

        // Mark as successfully deleted (image will be removed from UI by React Query cache update)
        setDeletedImageKeys((prev) => new Set(prev).add(imageKey));

        // Remove from deleting set after a brief delay to ensure smooth transition
        // The image will disappear from the list due to React Query cache update
        setTimeout(() => {
          setDeletingImages((prev) => {
            const updated = new Set(prev);
            updated.delete(imageKey);
            return updated;
          });
        }, 100);

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
        // React Query handles the rollback, component will automatically update

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
    [galleryId, deletingImages, showToast, queryClient, deleteGalleryImageMutation]
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
  };
};
