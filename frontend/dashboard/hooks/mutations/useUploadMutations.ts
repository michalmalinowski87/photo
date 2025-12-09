import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import { useOrderStatusPolling } from "../queries/useOrderStatusPolling";

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
  const { resetTimer } = useOrderStatusPolling();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.uploads.markFinalUploadComplete(galleryId, orderId),
    onSuccess: (_, variables) => {
      // Reset polling timer after successful mutation
      resetTimer();
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
      // Invalidate gallery list to refresh finalsBytesUsed for publish button state
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.lists(),
      });
    },
  });
}

export function useGetFinalImagePresignedUrlsBatch() {
  return useMutation({
    mutationFn: ({
      galleryId,
      orderId,
      data,
    }: {
      galleryId: string;
      orderId: string;
      data: {
        files: Array<{
          key: string;
          contentType?: string;
          includeThumbnails?: boolean;
        }>;
      };
    }) => api.uploads.getFinalImagePresignedUrlsBatch(galleryId, orderId, data),
  });
}

export function useGetPresignedUrlsBatch() {
  return useMutation({
    mutationFn: (data: {
      galleryId: string;
      files: Array<{
        key: string;
        contentType?: string;
        fileSize?: number;
        includeThumbnails?: boolean;
      }>;
    }) => api.uploads.getPresignedUrlsBatch(data),
  });
}

export function useCreateMultipartUpload() {
  return useMutation({
    mutationFn: ({
      galleryId,
      data,
    }: {
      galleryId: string;
      data: {
        orderId?: string;
        files: Array<{
          key: string;
          contentType?: string;
          fileSize: number;
        }>;
      };
    }) => api.uploads.createMultipartUpload(galleryId, data),
  });
}

export function useCompleteMultipartUpload() {
  return useMutation({
    mutationFn: ({
      galleryId,
      data,
    }: {
      galleryId: string;
      data: {
        uploadId: string;
        key: string;
        fileSize?: number;
        parts: Array<{
          partNumber: number;
          etag: string;
        }>;
      };
    }) => api.uploads.completeMultipartUpload(galleryId, data),
  });
}

export function useAbortMultipartUpload() {
  return useMutation({
    mutationFn: ({
      galleryId,
      data,
    }: {
      galleryId: string;
      data: {
        uploadId: string;
        key: string;
      };
    }) => api.uploads.abortMultipartUpload(galleryId, data),
  });
}

export function useCompleteUpload() {
  return useMutation({
    mutationFn: ({
      galleryId,
      data,
    }: {
      galleryId: string;
      data: {
        key: string;
        fileSize: number;
      };
    }) => api.uploads.completeUpload(galleryId, data),
  });
}
