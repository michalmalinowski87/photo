import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Gallery } from "../../types";

export function useCreateGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Gallery>) => api.galleries.create(data),
    onSuccess: (data) => {
      if (data?.galleryId) {
        queryClient.setQueryData(queryKeys.galleries.detail(data.galleryId), data);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}

export function useUpdateGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, data }: { galleryId: string; data: Partial<Gallery> }) =>
      api.galleries.update(galleryId, data),
    onMutate: async ({ galleryId, data }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.lists(),
      });

      // Snapshot previous values
      const previousGallery = queryClient.getQueryData<Gallery>(
        queryKeys.galleries.detail(galleryId)
      );
      const previousGalleryList = queryClient.getQueryData<Gallery[]>(queryKeys.galleries.lists());

      // Optimistically update gallery detail
      queryClient.setQueryData<Gallery>(queryKeys.galleries.detail(galleryId), (old) => {
        if (!old) {return old;}
        return {
          ...old,
          ...data,
        };
      });

      // Optimistically update gallery in list if it exists
      if (previousGalleryList) {
        queryClient.setQueryData<Gallery[]>(queryKeys.galleries.lists(), (old) => {
          if (!old) {return old;}
          return old.map((gallery) =>
            gallery.galleryId === galleryId ? { ...gallery, ...data } : gallery
          );
        });
      }

      return { previousGallery, previousGalleryList };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousGallery) {
        queryClient.setQueryData(
          queryKeys.galleries.detail(variables.galleryId),
          context.previousGallery
        );
      }
      if (context?.previousGalleryList) {
        queryClient.setQueryData(queryKeys.galleries.lists(), context.previousGalleryList);
      }
    },
    onSuccess: (data, variables) => {
      // Update cache with response data if available (more accurate than optimistic update)
      if (data) {
        queryClient.setQueryData(queryKeys.galleries.detail(variables.galleryId), data);
      }
    },
    onSettled: (_, __, variables) => {
      // Refetch to ensure consistency
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}

export function useDeleteGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (galleryId: string) => api.galleries.delete(galleryId),
    onSuccess: (_, galleryId) => {
      queryClient.removeQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}

export function useSendGalleryToClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (galleryId: string) => api.galleries.sendToClient(galleryId),
    onSuccess: (_, galleryId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(galleryId) });
    },
  });
}

export function usePayGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      galleryId: string;
      options?: {
        dryRun?: boolean;
        plan?: string;
        priceCents?: number;
        redirectUrl?: string;
      };
    }) => api.galleries.pay(params.galleryId, params.options || {}),
    onSuccess: (_, variables) => {
      // Invalidate gallery detail (payment status changes) and wallet balance
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    },
  });
}

export function useUpdateGalleryClientPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      password,
      clientEmail,
    }: {
      galleryId: string;
      password: string;
      clientEmail: string;
    }) => api.galleries.updateClientPassword(galleryId, password, clientEmail),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
    },
  });
}

export function useUpdateGalleryPricingPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      pricingPackage,
    }: {
      galleryId: string;
      pricingPackage: {
        packageName?: string;
        includedCount: number;
        extraPriceCents: number;
        packagePriceCents: number;
      };
    }) => api.galleries.updatePricingPackage(galleryId, pricingPackage),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}

export function useUpgradeGalleryPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      data,
    }: {
      galleryId: string;
      data: { plan: string; redirectUrl?: string };
    }) => api.galleries.upgradePlan(galleryId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    },
  });
}

export function useDeleteGalleryImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, imageKey }: { galleryId: string; imageKey: string }) =>
      api.galleries.deleteImage(galleryId, imageKey),
    onMutate: async ({ galleryId, imageKey }) => {
      // Cancel outgoing refetches to avoid race conditions
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.images(galleryId, "originals"),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.images(galleryId, "thumb"),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });

      // Snapshot previous values for rollback on error
      const previousOriginals = queryClient.getQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "originals")
      );
      const previousThumbs = queryClient.getQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "thumb")
      );
      const previousGallery = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));

      // Get file size from image cache before removing it
      const imageToDelete = previousOriginals?.find(
        (img) => (img.key ?? img.filename) === imageKey
      );
      const rawFileSize = imageToDelete?.size || imageToDelete?.bytes || 0;
      // Validate file size - must be positive and reasonable (max 10GB)
      const fileSize = rawFileSize > 0 && rawFileSize < 10 * 1024 * 1024 * 1024 ? rawFileSize : 0;

      // Optimistically decrease storage usage if we have valid file size
      // Backend handles setting storage to 0 when no images remain (safety check in onS3DeleteBatch)
      // If file size is missing/invalid, skip optimistic update - backend will still update correctly
      if (fileSize > 0) {
        // Update storage usage in gallery detail if it exists
        queryClient.setQueryData<any>(queryKeys.galleries.detail(galleryId), (old) => {
          if (!old) {return old;}
          return {
            ...old,
            originalsBytesUsed: Math.max(0, (old.originalsBytesUsed || 0) - fileSize),
            // Total storage is computed dynamically: originalsBytesUsed + finalsBytesUsed
          };
        });
      }

      // Don't optimistically remove image from cache - wait for response to avoid flicker
      // Image will show loading overlay via deletingImages state

      return { previousOriginals, previousThumbs, previousGallery, imageKey, fileSize };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousOriginals) {
        queryClient.setQueryData(
          queryKeys.galleries.images(variables.galleryId, "originals"),
          context.previousOriginals
        );
      }
      if (context?.previousThumbs) {
        queryClient.setQueryData(
          queryKeys.galleries.images(variables.galleryId, "thumb"),
          context.previousThumbs
        );
      }
      if (context?.previousGallery) {
        queryClient.setQueryData(
          queryKeys.galleries.detail(variables.galleryId),
          context.previousGallery
        );
      }
      // On error, invalidate to refetch and ensure consistency
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "originals"),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "thumb"),
      });
    },
    onSuccess: (_data, variables, context) => {
      // Optimistically remove image from cache after successful deletion
      // This happens after response, so we know it's safe
      queryClient.setQueryData<any[]>(
        queryKeys.galleries.images(variables.galleryId, "originals"),
        (old) => old?.filter((img) => (img.key ?? img.filename) !== variables.imageKey) ?? []
      );
      queryClient.setQueryData<any[]>(
        queryKeys.galleries.images(variables.galleryId, "thumb"),
        (old) => old?.filter((img) => (img.key ?? img.filename) !== variables.imageKey) ?? []
      );

      // After a delay, invalidate storage usage to get real value from backend
      // This reconciles any differences between optimistic and actual values
      // The backend delete handler will update storage usage automatically
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.detail(variables.galleryId),
        });
      }, 2000); // 2 seconds - enough time for backend to process deletion
    },
  });
}

export function useDeleteGalleryImagesBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, imageKeys }: { galleryId: string; imageKeys: string[] }) =>
      api.galleries.deleteImagesBatch(galleryId, imageKeys),
    onMutate: async ({ galleryId, imageKeys }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.images(galleryId, "originals"),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.images(galleryId, "thumb"),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });

      // Snapshot previous values
      const previousOriginals = queryClient.getQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "originals")
      );
      const previousThumbs = queryClient.getQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "thumb")
      );
      const previousGallery = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));

      // Calculate total file size from images being deleted
      // Validate file sizes - only count valid, positive sizes
      const imageKeysSet = new Set(imageKeys);
      const totalFileSize = previousOriginals?.reduce((sum, img) => {
        const imgKey = img.key ?? img.filename;
        if (imgKey && imageKeysSet.has(imgKey)) {
          const rawSize = img.size || img.bytes || 0;
          // Validate: must be positive and reasonable (max 10GB per file)
          const validSize = rawSize > 0 && rawSize < 10 * 1024 * 1024 * 1024 ? rawSize : 0;
          return sum + validSize;
        }
        return sum;
      }, 0) || 0;

      // Optimistically remove images from both image lists
      queryClient.setQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "originals"),
        (old) =>
          old?.filter((img) => {
            const imgKey = img.key ?? img.filename;
            return imgKey && !imageKeysSet.has(imgKey);
          }) ?? []
      );
      queryClient.setQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "thumb"),
        (old) =>
          old?.filter((img) => {
            const imgKey = img.key ?? img.filename;
            return imgKey && !imageKeysSet.has(imgKey);
          }) ?? []
      );

      // Optimistically decrease storage usage if we have file sizes
      // Backend handles setting storage to 0 when no images remain (safety check in onS3DeleteBatch)
      if (totalFileSize > 0) {
        // Update storage usage in gallery detail if it exists
        queryClient.setQueryData<any>(queryKeys.galleries.detail(galleryId), (old) => {
          if (!old) {return old;}
          return {
            ...old,
            originalsBytesUsed: Math.max(0, (old.originalsBytesUsed || 0) - totalFileSize),
            // Total storage is computed dynamically: originalsBytesUsed + finalsBytesUsed
          };
        });
      }

      return { previousOriginals, previousThumbs, previousGallery, totalFileSize };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousOriginals) {
        queryClient.setQueryData(
          queryKeys.galleries.images(variables.galleryId, "originals"),
          context.previousOriginals
        );
      }
      if (context?.previousThumbs) {
        queryClient.setQueryData(
          queryKeys.galleries.images(variables.galleryId, "thumb"),
          context.previousThumbs
        );
      }
      if (context?.previousGallery) {
        queryClient.setQueryData(
          queryKeys.galleries.detail(variables.galleryId),
          context.previousGallery
        );
      }
    },
    onSettled: (_, __, variables) => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "originals"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "thumb"),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
    },
  });
}
