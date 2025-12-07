import { useCallback, useRef, useState } from "react";

import { formatApiError } from "../lib/api-service";

import { useDeleteGalleryImagesBatch } from "./mutations/useGalleryMutations";
import { useToast } from "./useToast";

interface UseBulkImageDeleteOptions {
  galleryId: string | string[] | undefined;
  imageType?: "originals" | "finals" | "thumb";
}

export const useBulkImageDelete = ({ 
  galleryId,
  imageType = "originals",
}: UseBulkImageDeleteOptions) => {
  const { showToast } = useToast();
  const deleteBatchMutation = useDeleteGalleryImagesBatch();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletedImageKeys, setDeletedImageKeys] = useState<Set<string>>(new Set());
  const isDeletingRef = useRef(false);

  // Toast batching refs
  const successToastBatchRef = useRef<number>(0);
  const errorToastBatchRef = useRef<number>(0);
  const successToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const deleteImages = useCallback(
    async (imageKeys: string[]): Promise<void> => {
      if (!galleryId || imageKeys.length === 0) {
        return;
      }

      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;

      if (!galleryIdStr) {
        return;
      }

      // Prevent duplicate deletions
      if (isDeletingRef.current) {
        return;
      }

      setIsDeleting(true);
      isDeletingRef.current = true;

      try {
        // Optimistic updates are handled in the mutation's onMutate
        // Images are immediately removed from cache
        await deleteBatchMutation.mutateAsync({
          galleryId: galleryIdStr,
          imageKeys,
          imageType,
        });

        // Mark images as successfully deleted - they'll be filtered out even if they reappear during refetch
        setDeletedImageKeys((prev) => {
          const next = new Set(prev);
          imageKeys.forEach((key) => next.add(key));
          return next;
        });

        // Clear deleted keys after 30 seconds to allow eventual consistency
        imageKeys.forEach((imageKey) => {
          setTimeout(() => {
            setDeletedImageKeys((prev) => {
              const updated = new Set(prev);
              updated.delete(imageKey);
              return updated;
            });
          }, 30000);
        });

        // Batch success toasts - accumulate count and show single toast
        successToastBatchRef.current += imageKeys.length;

        if (!successToastTimeoutRef.current) {
          successToastTimeoutRef.current = setTimeout(() => {
            const count = successToastBatchRef.current;
            successToastBatchRef.current = 0;
            successToastTimeoutRef.current = null;
            if (count === 1) {
              showToast("success", "Sukces", "Zdjęcie zostało usunięte");
            } else {
              showToast("success", "Sukces", `${count} zdjęć zostało usuniętych`);
            }
          }, 800);
        }
      } catch (err) {
        // On error, the mutation's onError will rollback React Query cache

        // Batch error toasts - accumulate count and show single toast
        errorToastBatchRef.current += imageKeys.length;
        const errorMessage = formatApiError(err);

        if (!errorToastTimeoutRef.current) {
          errorToastTimeoutRef.current = setTimeout(() => {
            const count = errorToastBatchRef.current;
            errorToastBatchRef.current = 0;
            errorToastTimeoutRef.current = null;
            if (count === 1) {
              showToast("error", "Błąd", errorMessage);
            } else {
              showToast("error", "Błąd", `Nie udało się usunąć ${count} zdjęć`);
            }
          }, 800);
        }
        throw err;
      } finally {
        setIsDeleting(false);
        isDeletingRef.current = false;
      }
    },
    [galleryId, deleteBatchMutation, imageType, showToast]
  );

  return {
    deleteImages,
    deletingImages: new Set<string>(), // Empty set - images are optimistically removed from cache immediately via mutation's onMutate, so no need to track them as "deleting"
    deletedImageKeys, // Track successfully deleted images to filter them out even if they reappear during refetch
    isDeleting,
  };
};

