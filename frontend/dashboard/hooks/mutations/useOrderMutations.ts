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
    onSuccess: (data, variables) => {
      // Update cache directly with response data if available
      if (data) {
        queryClient.setQueryData(
          queryKeys.orders.detail(variables.galleryId, variables.orderId),
          data
        );
      } else {
        queryClient.invalidateQueries({
          queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
        });
      }
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
    onSuccess: (data, variables) => {
      // Update cache directly with response data if available
      if (data) {
        queryClient.setQueryData(
          queryKeys.orders.detail(variables.galleryId, variables.orderId),
          data
        );
      } else {
        queryClient.invalidateQueries({
          queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
        });
      }
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
    onMutate: async ({ galleryId, orderId, imageKey }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.orders.finalImages(galleryId, orderId),
      });

      // Snapshot previous values
      const previousFinalImages = queryClient.getQueryData<any[]>(
        queryKeys.orders.finalImages(galleryId, orderId)
      );
      const previousGallery = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));

      // Optimistically remove image from final images list
      queryClient.setQueryData<any[]>(
        queryKeys.orders.finalImages(galleryId, orderId),
        (old) => old?.filter((img) => (img.key ?? img.filename) !== imageKey) ?? []
      );

      return { previousFinalImages, previousGallery };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousFinalImages) {
        queryClient.setQueryData(
          queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
          context.previousFinalImages
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
    onMutate: async ({ galleryId, orderId, imageKeys }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.orders.finalImages(galleryId, orderId),
      });

      // Snapshot previous values
      const previousFinalImages = queryClient.getQueryData<any[]>(
        queryKeys.orders.finalImages(galleryId, orderId)
      );
      const previousGallery = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));

      // Optimistically remove images from final images list
      const imageKeysSet = new Set(imageKeys);
      queryClient.setQueryData<any[]>(
        queryKeys.orders.finalImages(galleryId, orderId),
        (old) =>
          old?.filter((img) => {
            const imgKey = img.key ?? img.filename;
            return imgKey && !imageKeysSet.has(imgKey);
          }) ?? []
      );

      return { previousFinalImages, previousGallery };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousFinalImages) {
        queryClient.setQueryData(
          queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
          context.previousFinalImages
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
    onSuccess: (data, variables) => {
      // Update cache directly with response data if available
      if (data) {
        queryClient.setQueryData(
          queryKeys.orders.detail(variables.galleryId, variables.orderId),
          data
        );
      } else {
        // Fall back to invalidation if response doesn't contain complete data
        queryClient.invalidateQueries({
          queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
        });
      }
      // Always invalidate lists to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
    },
  });
}
