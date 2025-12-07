import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { formatApiError } from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { GalleryImage } from "../types";

import { useDeleteGalleryImage } from "./mutations/useGalleryMutations";
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

  // Global deletion lock - prevents new deletions until current one completes and image is removed
  const isDeletionInProgressRef = useRef<boolean>(false);

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

      // Prevent new deletions if one is already in progress
      if (isDeletionInProgressRef.current) {
        return;
      }

      // Set global deletion lock
      isDeletionInProgressRef.current = true;

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

        // Mark as successfully deleted (image will be removed from UI by React Query cache update)
        setDeletedImageKeys((prev) => new Set(prev).add(imageKey));

        // Wait for the image to be removed from the view by refetching and checking
        // This ensures the UI is updated before allowing the next deletion
        const waitForImageRemoval = async (): Promise<void> => {
          // Get initial query data to compare against
          const initialOriginalsData = queryClient.getQueryData<any[]>(
            queryKeys.galleries.images(galleryIdStr, "originals")
          );
          const initialThumbData = queryClient.getQueryData<any[]>(
            queryKeys.galleries.images(galleryIdStr, "thumb")
          );

          // Refetch the images queries to get updated data
          await queryClient.refetchQueries({
            queryKey: queryKeys.galleries.images(galleryIdStr, "originals"),
          });
          await queryClient.refetchQueries({
            queryKey: queryKeys.galleries.images(galleryIdStr, "thumb"),
          });

          // Poll to check if image is removed (with timeout)
          // Check both queries to be thorough
          const maxAttempts = 15; // Increased attempts
          const pollInterval = 150; // 150ms between checks
          
          let confirmedRemoved = false;
          
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const originalsData = queryClient.getQueryData<any[]>(
              queryKeys.galleries.images(galleryIdStr, "originals")
            );
            const thumbData = queryClient.getQueryData<any[]>(
              queryKeys.galleries.images(galleryIdStr, "thumb")
            );
            
            // Check both queries - image must be absent from both
            const existsInOriginals = originalsData?.some(
              (img: any) => (img.key ?? img.filename) === imageKey
            );
            const existsInThumb = thumbData?.some(
              (img: any) => (img.key ?? img.filename) === imageKey
            );
            
            // Also verify that the data actually changed (not just empty)
            const dataChanged = 
              (originalsData?.length !== initialOriginalsData?.length) ||
              (thumbData?.length !== initialThumbData?.length);
            
            if (!existsInOriginals && !existsInThumb && dataChanged) {
              // Image has been removed from both queries and data changed
              confirmedRemoved = true;
              break;
            }
            
            // If data hasn't changed yet, wait a bit longer before next check
            if (!dataChanged && attempt < 5) {
              await new Promise((resolve) => setTimeout(resolve, pollInterval * 2));
            } else {
              await new Promise((resolve) => setTimeout(resolve, pollInterval));
            }
          }

          // Add a small buffer delay after confirming removal to ensure React has re-rendered
          if (confirmedRemoved) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        };

        // Wait for image to be removed from view before allowing next deletion
        await waitForImageRemoval();

        // Remove from deleting set
        setDeletingImages((prev) => {
          const updated = new Set(prev);
          updated.delete(imageKey);
          return updated;
        });

        // Clear deleted key after 30 seconds to allow eventual consistency
        setTimeout(() => {
          setDeletedImageKeys((prev) => {
            const updated = new Set(prev);
            updated.delete(imageKey);
            return updated;
          });
        }, 30000);

        // Release global deletion lock
        isDeletionInProgressRef.current = false;

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

        // Release global deletion lock on error
        isDeletionInProgressRef.current = false;

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

      // Prevent deletion if image is already marked as deleted
      if (deletedImageKeys.has(imageKey)) {
        return null;
      }

      // Prevent deletion if another deletion is in progress
      if (isDeletionInProgressRef.current) {
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
    [deleteImage, deletingImages, deletedImageKeys]
  );

  return {
    deleteImage,
    handleDeleteImageClick,
    deletingImages,
    deletedImageKeys,
  };
};
