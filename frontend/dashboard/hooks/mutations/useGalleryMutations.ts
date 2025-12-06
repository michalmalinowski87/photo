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
      const previousGalleryList = queryClient.getQueryData<Gallery[]>(
        queryKeys.galleries.lists()
      );

      // Optimistically update gallery detail
      queryClient.setQueryData<Gallery>(
        queryKeys.galleries.detail(galleryId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            ...data,
          };
        }
      );

      // Optimistically update gallery in list if it exists
      if (previousGalleryList) {
        queryClient.setQueryData<Gallery[]>(
          queryKeys.galleries.lists(),
          (old) => {
            if (!old) return old;
            return old.map((gallery) =>
              gallery.galleryId === galleryId ? { ...gallery, ...data } : gallery
            );
          }
        );
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
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.images(galleryId, "originals"),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.images(galleryId, "thumb"),
      });

      // Snapshot previous values
      const previousOriginals = queryClient.getQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "originals")
      );
      const previousThumbs = queryClient.getQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "thumb")
      );
      const previousGallery = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));

      // Optimistically remove image from both image lists
      queryClient.setQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "originals"),
        (old) => old?.filter((img) => (img.key ?? img.filename) !== imageKey) ?? []
      );
      queryClient.setQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "thumb"),
        (old) => old?.filter((img) => (img.key ?? img.filename) !== imageKey) ?? []
      );

      return { previousOriginals, previousThumbs, previousGallery };
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.bytesUsed(variables.galleryId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
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

      // Snapshot previous values
      const previousOriginals = queryClient.getQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "originals")
      );
      const previousThumbs = queryClient.getQueryData<any[]>(
        queryKeys.galleries.images(galleryId, "thumb")
      );
      const previousGallery = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));

      // Optimistically remove images from both image lists
      const imageKeysSet = new Set(imageKeys);
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

      return { previousOriginals, previousThumbs, previousGallery };
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.bytesUsed(variables.galleryId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
    },
  });
}
