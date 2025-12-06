import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/react-query";

/**
 * Hook to invalidate cache after original images are uploaded
 * This should be called after upload completes in useUppyUpload
 */
export function useInvalidateAfterOriginalUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (galleryId: string) => {
      // This mutation doesn't call an API - it just invalidates cache
      return { galleryId };
    },
    onSuccess: (_, galleryId) => {
      // Invalidate images, bytes used, and gallery detail
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(galleryId, "originals"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(galleryId, "thumb"),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.bytesUsed(galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.status(galleryId) });
    },
  });
}

/**
 * Hook to invalidate cache after final images are uploaded
 * This should be called after upload completes in useUppyUpload
 */
export function useInvalidateAfterFinalUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ galleryId, orderId }: { galleryId: string; orderId: string }) => {
      // This mutation doesn't call an API - it just invalidates cache
      return { galleryId, orderId };
    },
    onSuccess: (_, variables) => {
      // Invalidate final images, order detail, gallery detail, and bytes used
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "finals"),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(variables.galleryId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.bytesUsed(variables.galleryId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(variables.galleryId) });
    },
  });
}

/**
 * Utility function to invalidate cache after upload (can be called directly without hook)
 * Useful for useUppyUpload hook integration
 */
export function invalidateAfterOriginalUpload(
  queryClient: ReturnType<typeof useQueryClient>,
  galleryId: string
) {
  queryClient.invalidateQueries({
    queryKey: queryKeys.galleries.images(galleryId, "originals"),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.galleries.images(galleryId, "thumb"),
  });
  queryClient.invalidateQueries({ queryKey: queryKeys.galleries.bytesUsed(galleryId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.galleries.status(galleryId) });
}

/**
 * Utility function to invalidate cache after final upload (can be called directly without hook)
 * Useful for useUppyUpload hook integration
 */
export function invalidateAfterFinalUpload(
  queryClient: ReturnType<typeof useQueryClient>,
  galleryId: string,
  orderId: string
) {
  queryClient.invalidateQueries({
    queryKey: queryKeys.orders.finalImages(galleryId, orderId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.orders.detail(galleryId, orderId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.galleries.images(galleryId, "finals"),
  });
  queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.galleries.bytesUsed(galleryId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(galleryId) });
}
