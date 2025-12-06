import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

export function useApproveChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.approveChangeRequest(galleryId, orderId),
    onSuccess: (_, variables) => {
      // Invalidate order detail, orders by gallery, and gallery detail
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
    },
  });
}

export function useDenyChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      orderId,
      reason,
    }: {
      galleryId: string;
      orderId: string;
      reason?: string;
    }) => api.orders.denyChangeRequest(galleryId, orderId, reason),
    onSuccess: (_, variables) => {
      // Invalidate order detail, orders by gallery, and gallery detail
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
    },
  });
}

export function useMarkOrderPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markPaid(galleryId, orderId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
    },
  });
}

export function useMarkOrderPartiallyPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markPartiallyPaid(galleryId, orderId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
    },
  });
}

export function useMarkOrderCanceled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markCanceled(galleryId, orderId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
    },
  });
}

export function useMarkOrderRefunded() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markRefunded(galleryId, orderId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
    },
  });
}

export function useSendFinalLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.sendFinalLink(galleryId, orderId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
    },
  });
}

export function useDeleteFinalImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      orderId,
      imageKey,
    }: {
      galleryId: string;
      orderId: string;
      imageKey: string;
    }) => api.orders.deleteFinalImage(galleryId, orderId, imageKey),
    onSuccess: (_, variables) => {
      // Invalidate final images, gallery detail, and bytes used
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "finals"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.bytesUsed(variables.galleryId),
      });
    },
  });
}

export function useDeleteFinalImagesBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      orderId,
      imageKeys,
    }: {
      galleryId: string;
      orderId: string;
      imageKeys: string[];
    }) => api.orders.deleteFinalImagesBatch(galleryId, orderId, imageKeys),
    onSuccess: (_, variables) => {
      // Invalidate final images, gallery detail, and bytes used
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "finals"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.bytesUsed(variables.galleryId),
      });
    },
  });
}

export function useCleanupOriginals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.cleanupOriginals(galleryId, orderId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "originals"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.bytesUsed(variables.galleryId),
      });
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      orderId,
      data,
    }: {
      galleryId: string;
      orderId: string;
      data: Partial<any>;
    }) => api.orders.update(galleryId, orderId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
    },
  });
}
