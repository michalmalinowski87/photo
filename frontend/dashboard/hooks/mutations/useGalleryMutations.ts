import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Gallery } from "../../store/gallerySlice";

export function useCreateGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Gallery>) => api.galleries.create(data),
    onSuccess: () => {
      // Invalidate gallery lists to show new gallery
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}

export function useUpdateGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, data }: { galleryId: string; data: Partial<Gallery> }) =>
      api.galleries.update(galleryId, data),
    onSuccess: (_, variables) => {
      // Invalidate specific gallery and all lists
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}

export function useDeleteGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (galleryId: string) => api.galleries.delete(galleryId),
    onSuccess: (_, galleryId) => {
      // Remove from cache and invalidate lists
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
      // Invalidate gallery detail and orders (new order may have been created)
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
    onSuccess: (_, variables) => {
      // Invalidate images, bytes used, and gallery detail
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
    onSuccess: (_, variables) => {
      // Invalidate images, bytes used, and gallery detail
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
