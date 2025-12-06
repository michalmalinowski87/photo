import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

export function useValidateUploadLimits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (galleryId: string) => api.galleries.validateUploadLimits(galleryId),
    onSuccess: (_, galleryId) => {
      // Invalidate gallery detail to reflect updated limits
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });
    },
  });
}

export function useMarkFinalUploadComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.uploads.markFinalUploadComplete(galleryId, orderId),
    onSuccess: (_, variables) => {
      // Invalidate order detail, final images, and gallery detail
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "finals"),
      });
    },
  });
}
