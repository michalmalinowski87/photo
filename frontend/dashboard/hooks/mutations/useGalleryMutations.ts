import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Gallery, GalleryImage } from "../../types";

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
        if (!old) {
          return old;
        }
        return {
          ...old,
          ...data,
        };
      });

      // Optimistically update gallery in list if it exists
      if (previousGalleryList) {
        queryClient.setQueryData<Gallery[]>(queryKeys.galleries.lists(), (old) => {
          if (!old) {
            return old;
          }
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
    onSuccess: (_data, variables) => {
      // Invalidate image queries immediately - these should be accurate
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "originals"),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "thumb"),
      });
      
      // Delay gallery detail invalidation to allow async S3 deletion to complete
      // The backend processes S3 deletion asynchronously, so we wait a bit for
      // the database to be updated with the correct storage bytes
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.detail(variables.galleryId),
        });
      }, 1500); // 1.5 seconds - enough time for S3 deletion Lambda to update DB
    },
  });
}

export function useDeleteGalleryImagesBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      galleryId, 
      imageKeys,
      imageType = "originals",
    }: { 
      galleryId: string; 
      imageKeys: string[];
      imageType?: "originals" | "finals" | "thumb";
    }) => api.galleries.deleteImagesBatch(galleryId, imageKeys),
    onMutate: async ({ galleryId, imageKeys, imageType = "originals" }) => {
      // Cancel outgoing queries to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.images(galleryId, imageType),
      });
      
      // Also cancel thumb queries if deleting originals
      if (imageType === "originals") {
        await queryClient.cancelQueries({
          queryKey: queryKeys.galleries.images(galleryId, "thumb"),
        });
      }

      // Snapshot previous state
      const previousImages = queryClient.getQueryData<GalleryImage[]>(
        queryKeys.galleries.images(galleryId, imageType)
      );
      const previousThumbImages = imageType === "originals"
        ? queryClient.getQueryData<GalleryImage[]>(
            queryKeys.galleries.images(galleryId, "thumb")
          )
        : null;

      // Optimistically remove images from cache
      queryClient.setQueryData<GalleryImage[]>(
        queryKeys.galleries.images(galleryId, imageType),
        (old = []) =>
          old.filter(
            (img) => !imageKeys.includes(img.key ?? img.filename ?? "")
          )
      );

      // Also update thumb cache if deleting originals
      if (imageType === "originals") {
        queryClient.setQueryData<GalleryImage[]>(
          queryKeys.galleries.images(galleryId, "thumb"),
          (old = []) =>
            old.filter(
              (img) => !imageKeys.includes(img.key ?? img.filename ?? "")
            )
        );
      }

      return { previousImages, previousThumbImages };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousImages) {
        queryClient.setQueryData(
          queryKeys.galleries.images(variables.galleryId, variables.imageType || "originals"),
          context.previousImages
        );
      }
      if (context?.previousThumbImages && variables.imageType === "originals") {
        queryClient.setQueryData(
          queryKeys.galleries.images(variables.galleryId, "thumb"),
          context.previousThumbImages
        );
      }
    },
    onSuccess: (_data, variables) => {
      // Invalidate image queries immediately - these should be accurate
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, variables.imageType || "originals"),
      });
      
      // Also invalidate thumb queries if deleting originals
      if (variables.imageType === "originals" || !variables.imageType) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.images(variables.galleryId, "thumb"),
        });
      }
      
      // Delay gallery detail invalidation to allow async S3 deletion to complete
      // The backend processes S3 deletion asynchronously, so we wait a bit for
      // the database to be updated with the correct storage bytes
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.detail(variables.galleryId),
        });
      }, 1500); // 1.5 seconds - enough time for S3 deletion Lambda to update DB
    },
  });
}
