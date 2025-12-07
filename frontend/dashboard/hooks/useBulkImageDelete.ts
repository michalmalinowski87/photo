import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { formatApiError } from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { GalleryImage } from "../types";

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
  const queryClient = useQueryClient();
  const deleteBatchMutation = useDeleteGalleryImagesBatch();
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set());

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
      const alreadyDeleting = imageKeys.filter((key) => deletingImages.has(key));
      if (alreadyDeleting.length > 0) {
        return;
      }

      // Mark images as being deleted
      setDeletingImages((prev) => {
        const next = new Set(prev);
        imageKeys.forEach((key) => next.add(key));
        return next;
      });

      try {
        // Optimistic updates are handled in the mutation's onMutate
        await deleteBatchMutation.mutateAsync({
          galleryId: galleryIdStr,
          imageKeys,
          imageType,
        });

        // Remove from deleting set after successful deletion
        setDeletingImages((prev) => {
          const next = new Set(prev);
          imageKeys.forEach((key) => next.delete(key));
          return next;
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
        // Remove from deleting set
        setDeletingImages((prev) => {
          const next = new Set(prev);
          imageKeys.forEach((key) => next.delete(key));
          return next;
        });

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
      }
    },
    [galleryId, deletingImages, deleteBatchMutation, imageType, showToast]
  );

  return {
    deleteImages,
    deletingImages,
    isDeleting: deletingImages.size > 0,
  };
};

