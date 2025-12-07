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
        if (!old) {return old;}
        return {
          ...old,
          paymentStatus: "PAID",
        };
      });

      // Optimistically update order in list if it exists
      if (previousOrderList) {
        queryClient.setQueryData<Order[]>(queryKeys.orders.byGallery(galleryId), (old) => {
          if (!old) {return old;}
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

/**
 * Delete final images (handles both single and batch operations)
 * For single deletion, pass an array with one image key: [imageKey]
 */
export function useDeleteFinalImage() {
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
    }) => api.orders.deleteFinalImage(galleryId, orderId, imageKeys),
    onMutate: async ({ galleryId, orderId, imageKeys }) => {
      // Cancel outgoing queries to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.orders.finalImages(galleryId, orderId),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });

      // Snapshot previous state
      const previousFinalImages = queryClient.getQueryData<any[]>(
        queryKeys.orders.finalImages(galleryId, orderId)
      );
      const previousGallery = queryClient.getQueryData<any>(
        queryKeys.galleries.detail(galleryId)
      );

      // Calculate total file size from images being deleted for optimistic storage update
      let totalBytesToSubtract = 0;
      if (previousFinalImages) {
        const imagesToDelete = previousFinalImages.filter(
          (img: any) => imageKeys.includes(img.key ?? img.filename ?? "")
        );
        totalBytesToSubtract = imagesToDelete.reduce(
          (sum, img: any) => sum + (img.size || 0),
          0
        );
      }

      // Optimistically remove images from cache
      queryClient.setQueryData<any[]>(
        queryKeys.orders.finalImages(galleryId, orderId),
        (old = []) =>
          old.filter(
            (img: any) => !imageKeys.includes(img.key ?? img.filename ?? "")
          )
      );

      // Optimistically update storage usage for immediate UI feedback
      if (totalBytesToSubtract > 0 && previousGallery) {
        queryClient.setQueryData<any>(
          queryKeys.galleries.detail(galleryId),
          (old) => {
            if (!old) {
              return old;
            }
            const currentFinals = old.finalsBytesUsed || 0;
            return {
              ...old,
              finalsBytesUsed: Math.max(0, currentFinals - totalBytesToSubtract),
            };
          }
        );
      }

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
    onSuccess: (data, variables) => {
      // Update gallery detail with API response if available (more accurate than optimistic update)
      // The backend returns updated storage values synchronously
      if (data && typeof data === 'object' && 'finalsBytesUsed' in data) {
        queryClient.setQueryData<any>(
          queryKeys.galleries.detail(variables.galleryId),
          (old) => {
            if (!old) {
              return old;
            }
            return {
              ...old,
              finalsBytesUsed: data.finalsBytesUsed,
              finalsLimitBytes: data.finalsLimitBytes ?? old.finalsLimitBytes,
            };
          }
        );
      }
      
      // Invalidate final images query to ensure UI reflects backend state
      // Backend processes deletion synchronously, so we can invalidate immediately
      // Use Promise.resolve().then() to let React Query finish processing optimistic updates first
      void Promise.resolve().then(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.orders.finalImages(variables.galleryId, variables.orderId),
        });
        // Invalidate order detail to refresh order status (e.g., when all finals are deleted,
        // status may revert from PREPARING_DELIVERY to CLIENT_APPROVED or AWAITING_FINAL_PHOTOS)
        void queryClient.invalidateQueries({
          queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
        });
        // Also invalidate orders list to update status in lists
        void queryClient.invalidateQueries({
          queryKey: queryKeys.orders.byGallery(variables.galleryId),
        });
      });
      
      // Storage is already updated with API response data above, so no need to invalidate
      // The API response contains the accurate storage values from the synchronous backend
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
