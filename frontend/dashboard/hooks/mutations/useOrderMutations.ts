import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Order } from "../../types";

export function useApproveChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.approveChangeRequest(galleryId, orderId),
    onSuccess: (_, variables) => {
      // Invalidate order detail, orders by gallery, and gallery detail
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
    },
  });
}

export function useMarkOrderPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markPaid(galleryId, orderId),
    onMutate: async ({ galleryId, orderId }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.orders.detail(galleryId, orderId),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.orders.byGallery(galleryId),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });

      // Snapshot previous values
      const previousOrder = queryClient.getQueryData<Order>(
        queryKeys.orders.detail(galleryId, orderId)
      );
      const previousOrderList = queryClient.getQueryData<Order[]>(
        queryKeys.orders.byGallery(galleryId)
      );
      const previousGallery = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));

      // Optimistically update order payment status
      queryClient.setQueryData<Order>(queryKeys.orders.detail(galleryId, orderId), (old) => {
        if (!old) return old;
        return {
          ...old,
          paymentStatus: "PAID",
        };
      });

      // Optimistically update order in list if it exists
      if (previousOrderList) {
        queryClient.setQueryData<Order[]>(queryKeys.orders.byGallery(galleryId), (old) => {
          if (!old) return old;
          return old.map((order) =>
            order.orderId === orderId ? { ...order, paymentStatus: "PAID" } : order
          );
        });
      }

      return { previousOrder, previousOrderList, previousGallery };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousOrder) {
        queryClient.setQueryData(
          queryKeys.orders.detail(variables.galleryId, variables.orderId),
          context.previousOrder
        );
      }
      if (context?.previousOrderList) {
        queryClient.setQueryData(
          queryKeys.orders.byGallery(variables.galleryId),
          context.previousOrderList
        );
      }
      if (context?.previousGallery) {
        queryClient.setQueryData(
          queryKeys.galleries.detail(variables.galleryId),
          context.previousGallery
        );
      }
    },
    onSuccess: (data, variables) => {
      // Update cache with response data if available (more accurate than optimistic update)
      if (data) {
        queryClient.setQueryData(
          queryKeys.orders.detail(variables.galleryId, variables.orderId),
          data
        );
      }
    },
    onSettled: (_, __, variables) => {
      // Refetch to ensure consistency
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
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
        void queryClient.invalidateQueries({
          queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
    },
  });
}

export function useMarkOrderCanceled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markCanceled(galleryId, orderId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
    },
  });
}

export function useMarkOrderRefunded() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markRefunded(galleryId, orderId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
    },
  });
}

export function useSendFinalLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.sendFinalLink(galleryId, orderId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
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
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });

      // Snapshot previous values
      interface FinalImage {
        key?: string;
        filename?: string;
        size?: number;
        bytes?: number;
        [key: string]: unknown;
      }
      const previousFinalImages = queryClient.getQueryData<FinalImage[]>(
        queryKeys.orders.finalImages(galleryId, orderId)
      );
      const previousGallery = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));

      // Get file size from image cache before removing it
      const imageToDelete = previousFinalImages?.find(
        (img) => (img.key ?? img.filename) === imageKey
      );
      const rawFileSize = imageToDelete?.size || imageToDelete?.bytes || 0;
      // Validate file size - must be positive and reasonable (max 10GB)
      const fileSize = rawFileSize > 0 && rawFileSize < 10 * 1024 * 1024 * 1024 ? rawFileSize : 0;

      // Optimistically remove image from final images list
      queryClient.setQueryData<FinalImage[]>(
        queryKeys.orders.finalImages(galleryId, orderId),
        (old) => old?.filter((img) => (img.key ?? img.filename) !== imageKey) ?? []
      );

      // Optimistically decrease finalsBytesUsed if we have file size
      // Backend handles setting storage to 0 when no images remain (safety check in onS3DeleteBatch)
      if (fileSize > 0) {
        // Update storage usage in gallery detail if it exists
        queryClient.setQueryData<any>(queryKeys.galleries.detail(galleryId), (old) => {
          if (!old) return old;
          return {
            ...old,
            finalsBytesUsed: Math.max(0, (old.finalsBytesUsed || 0) - fileSize),
            // Total storage is computed dynamically: originalsBytesUsed + finalsBytesUsed
          };
        });
      }

      return { previousFinalImages, previousGallery, fileSize };
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
      // On error, invalidate to refetch and ensure consistency
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
      });
    },
    onSuccess: (_data, variables) => {
      // On success, optimistic update is already applied
      // After a delay, invalidate storage usage to get real value from backend
      // This reconciles any differences between optimistic and actual values
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.detail(variables.galleryId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
        });
      }, 2000); // 2 seconds - enough time for backend to process deletion
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
      interface FinalImage {
        key?: string;
        filename?: string;
        [key: string]: unknown;
      }
      const previousFinalImages = queryClient.getQueryData<FinalImage[]>(
        queryKeys.orders.finalImages(galleryId, orderId)
      );
      const previousGallery = queryClient.getQueryData(queryKeys.galleries.detail(galleryId));

      // Optimistically remove images from final images list
      const imageKeysSet = new Set(imageKeys);
      queryClient.setQueryData<FinalImage[]>(
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
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

export function useCleanupOriginals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.cleanupOriginals(galleryId, orderId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "originals"),
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
      data: Partial<Record<string, unknown>>;
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
        void queryClient.invalidateQueries({
          queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
        });
      }
      // Always invalidate lists to ensure consistency
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
    },
  });
}

export function useDownloadZip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.downloadZip(galleryId, orderId),
    onSuccess: (result, variables) => {
      // Handle ZIP download
      if (result.status === 202 || result.generating) {
        // ZIP is being generated - could implement polling here if needed
        return;
      }

      let blob: Blob;
      let filename: string;

      if (result.blob) {
        blob = result.blob;
        filename = result.filename ?? `${variables.orderId}.zip`;
      } else if (result.zip) {
        // Base64 ZIP response (backward compatibility)
        const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
        blob = new Blob([zipBlob], { type: "application/zip" });
        filename = result.filename ?? `${variables.orderId}.zip`;
      } else {
        throw new Error("No ZIP file available");
      }

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Invalidate orders to refresh state
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
    },
  });
}

export function useDownloadFinalZip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.downloadFinalZip(galleryId, orderId),
    onSuccess: (result, variables) => {
      // Handle ZIP download
      if (result.status === 202 || result.generating) {
        // ZIP is being generated - could implement polling here if needed
        return;
      }

      let blob: Blob;
      let filename: string;

      if (result.blob) {
        blob = result.blob;
        filename =
          result.filename ?? `gallery-${variables.galleryId}-order-${variables.orderId}-final.zip`;
      } else if (result.zip) {
        // Base64 ZIP response (backward compatibility)
        const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
        blob = new Blob([zipBlob], { type: "application/zip" });
        filename =
          result.filename ?? `gallery-${variables.galleryId}-order-${variables.orderId}-final.zip`;
      } else {
        throw new Error("No ZIP file available");
      }

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Invalidate orders to refresh state
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
    },
  });
}

export function useUploadFinalPhotos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      galleryId,
      orderId,
      files,
    }: {
      galleryId: string;
      orderId: string;
      files: File[];
    }) => {
      // Upload each file sequentially
      for (const file of files) {
        const fileName = file.name;
        // Get presigned URL
        const pr = await api.uploads.getFinalImagePresignedUrl(galleryId, orderId, {
          key: fileName,
          contentType: file.type ?? "application/octet-stream",
        });
        // Upload file
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
            }
          });
          xhr.addEventListener("error", () => reject(new Error("Upload failed")));
          xhr.open("PUT", pr.url);
          xhr.setRequestHeader("Content-Type", file.type ?? "application/octet-stream");
          xhr.send(file);
        });
      }
      return { success: true, fileCount: files.length };
    },
    onSuccess: (_, variables) => {
      // Invalidate order detail and related queries
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.images(variables.galleryId, "finals"),
      });
    },
  });
}
