import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import { refetchFirstPageOnly } from "../../lib/react-query-helpers";
import type { Gallery, GalleryImage, Order } from "../../types";
import { useOrderStatusPolling } from "../queries/useOrderStatusPolling";

export function useApproveChangeRequest() {
  const queryClient = useQueryClient();
  const { resetTimer } = useOrderStatusPolling();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.approveChangeRequest(galleryId, orderId),
    onSuccess: (_, variables) => {
      // Reset polling timer after successful mutation
      resetTimer();

      // Optimistically clear zipGenerating flag since approving change request means
      // old ZIP is invalid and new one will be generated when client approves new selection
      const orderDetailKey = queryKeys.orders.detail(variables.galleryId, variables.orderId);
      const existingOrder = queryClient.getQueryData<Order>(orderDetailKey);
      if (existingOrder) {
        queryClient.setQueryData<Order>(orderDetailKey, {
          ...existingOrder,
          zipGenerating: false,
          zipGeneratingSince: undefined,
          zipProgress: undefined,
        });
      }

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
      // Invalidate ZIP status queries to refetch immediately
      void queryClient.invalidateQueries({
        queryKey: ["zipStatus", variables.galleryId, variables.orderId],
      });
      // Invalidate gallery list queries to update sidebar badge
      // Approving a change request removes the order from CHANGES_REQUESTED status
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.lists(),
      });
      // Refetch first page of gallery images query to refresh unselectedCount when order status changes
      void refetchFirstPageOnly(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 3 &&
          key[0] === "galleries" &&
          key[1] === "detail" &&
          key[2] === variables.galleryId &&
          key[3] === "images"
        );
      });
    },
  });
}

export function useDenyChangeRequest() {
  const queryClient = useQueryClient();
  const { resetTimer } = useOrderStatusPolling();

  return useMutation({
    mutationFn: ({
      galleryId,
      orderId,
      reason,
      preventFutureChangeRequests,
    }: {
      galleryId: string;
      orderId: string;
      reason?: string;
      preventFutureChangeRequests?: boolean;
    }) => api.orders.denyChangeRequest(galleryId, orderId, reason, preventFutureChangeRequests),
    onSuccess: (_, variables) => {
      // Reset polling timer after successful mutation
      resetTimer();
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
      // Invalidate gallery list queries to update sidebar badge
      // Denying a change request removes the order from CHANGES_REQUESTED status
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.lists(),
      });
      // Refetch first page of gallery images query to refresh unselectedCount when order status changes
      void refetchFirstPageOnly(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 3 &&
          key[0] === "galleries" &&
          key[1] === "detail" &&
          key[2] === variables.galleryId &&
          key[3] === "images"
        );
      });
    },
  });
}

export function useMarkOrderPaid() {
  const queryClient = useQueryClient();
  const { resetTimer } = useOrderStatusPolling();

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
        if (!old) {
          return old;
        }
        return {
          ...old,
          paymentStatus: "PAID",
        };
      });

      // Optimistically update order in list if it exists
      if (previousOrderList) {
        queryClient.setQueryData<Order[]>(queryKeys.orders.byGallery(galleryId), (old) => {
          if (!old) {
            return old;
          }
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
      // Reset polling timer after successful mutation
      resetTimer();
      // Update cache with response data if available (more accurate than optimistic update)
      // Merge with existing order data to avoid overwriting with partial response
      if (data) {
        queryClient.setQueryData<Order>(
          queryKeys.orders.detail(variables.galleryId, variables.orderId),
          (old) => {
            if (!old) {
              // If no existing data, we can't merge, so invalidate to fetch full order
              return undefined;
            }
            // Merge partial response with existing order data
            return {
              ...old,
              ...data,
            };
          }
        );
      }
      // Invalidate orders list in background
      // Note: We don't invalidate gallery query - marking order as paid doesn't affect gallery payment status
      void Promise.resolve().then(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.orders.byGallery(variables.galleryId),
          refetchType: "active",
        });
      });
    },
  });
}

export function useMarkOrderPartiallyPaid() {
  const queryClient = useQueryClient();
  const { resetTimer } = useOrderStatusPolling();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markPartiallyPaid(galleryId, orderId),
    onSuccess: (data, variables) => {
      // Reset polling timer after successful mutation
      resetTimer();
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
  const { resetTimer } = useOrderStatusPolling();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markCanceled(galleryId, orderId),
    onSuccess: (_, variables) => {
      // Reset polling timer after successful mutation
      resetTimer();
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
  const { resetTimer } = useOrderStatusPolling();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.markRefunded(galleryId, orderId),
    onSuccess: (_, variables) => {
      // Reset polling timer after successful mutation
      resetTimer();
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
  const { resetTimer } = useOrderStatusPolling();

  return useMutation({
    mutationFn: ({ galleryId, orderId }: { galleryId: string; orderId: string }) =>
      api.orders.sendFinalLink(galleryId, orderId),
    onMutate: async ({ galleryId, orderId }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.orders.detail(galleryId, orderId),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.orders.byGallery(galleryId),
      });

      // Snapshot the previous values
      const previousOrderDetail = queryClient.getQueryData<Order>(
        queryKeys.orders.detail(galleryId, orderId)
      );
      const previousOrdersList = queryClient.getQueryData<Order[]>(
        queryKeys.orders.list(galleryId)
      );

      // Optimistically update the order detail
      if (previousOrderDetail) {
        queryClient.setQueryData<Order>(queryKeys.orders.detail(galleryId, orderId), {
          ...previousOrderDetail,
          deliveryStatus: "DELIVERED",
        });
      }

      // Optimistically update the order in the list
      if (previousOrdersList) {
        queryClient.setQueryData<Order[]>(
          queryKeys.orders.list(galleryId),
          previousOrdersList.map((order) =>
            order.orderId === orderId ? { ...order, deliveryStatus: "DELIVERED" } : order
          )
        );
      }

      // Return context with snapshots for rollback
      return { previousOrderDetail, previousOrdersList };
    },
    onError: (_err, variables, context) => {
      // Rollback optimistic updates on error
      if (context?.previousOrderDetail) {
        queryClient.setQueryData(
          queryKeys.orders.detail(variables.galleryId, variables.orderId),
          context.previousOrderDetail
        );
      }
      if (context?.previousOrdersList) {
        queryClient.setQueryData(
          queryKeys.orders.list(variables.galleryId),
          context.previousOrdersList
        );
      }
    },
    onSuccess: (_, variables) => {
      // Reset polling timer after successful mutation
      resetTimer();
      // Invalidate to refetch and get the real data from server
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.galleryId, variables.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orders.byGallery(variables.galleryId),
      });
      // Invalidate gallery delivered orders query so settings page reflects the new DELIVERED status
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.deliveredOrders(variables.galleryId),
      });
      // Also invalidate gallery detail to ensure all related queries are refreshed
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
      // Refetch first page of ALL gallery images queries to refresh unselectedCount when order status changes
      // This includes both the stats query (limit: 1) and filtered queries (filterUnselected, filterOrderId)
      // This ensures the "Niewybrane" count updates correctly immediately after approval
      void refetchFirstPageOnly(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 3 &&
          key[0] === "galleries" &&
          key[1] === "detail" &&
          key[2] === variables.galleryId &&
          key[3] === "images"
        );
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
  const { resetTimer } = useOrderStatusPolling();

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
      const previousFinalImages = queryClient.getQueryData<GalleryImage[]>(
        queryKeys.orders.finalImages(galleryId, orderId)
      );
      const previousGallery = queryClient.getQueryData<Gallery>(
        queryKeys.galleries.detail(galleryId)
      );

      // Calculate total file size from images being deleted for optimistic storage update
      let totalBytesToSubtract = 0;
      if (previousFinalImages) {
        const imagesToDelete = previousFinalImages.filter((img) =>
          imageKeys.includes(img.key ?? img.filename ?? "")
        );
        totalBytesToSubtract = imagesToDelete.reduce((sum, img) => sum + (img.size ?? 0), 0);
      }

      // Optimistically remove images from cache
      queryClient.setQueryData<GalleryImage[]>(
        queryKeys.orders.finalImages(galleryId, orderId),
        (old = []) => old.filter((img) => !imageKeys.includes(img.key ?? img.filename ?? ""))
      );

      // Optimistically update storage usage for immediate UI feedback
      if (totalBytesToSubtract > 0 && previousGallery) {
        queryClient.setQueryData<Gallery>(queryKeys.galleries.detail(galleryId), (old) => {
          if (!old) {
            return old;
          }
          const currentFinals = old.finalsBytesUsed ?? 0;
          return {
            ...old,
            finalsBytesUsed: Math.max(0, currentFinals - totalBytesToSubtract),
          };
        });
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
      // Reset polling timer after successful mutation (deleting final images can affect order status)
      resetTimer();
      // Update gallery detail with API response if available (more accurate than optimistic update)
      // The backend returns updated storage values synchronously
      if (data && typeof data === "object" && "finalsBytesUsed" in data) {
        queryClient.setQueryData<Gallery>(
          queryKeys.galleries.detail(variables.galleryId),
          (old) => {
            if (!old) {
              return old;
            }
            const dataTyped = data as { finalsBytesUsed: number; finalsLimitBytes?: number };
            return {
              ...old,
              finalsBytesUsed: dataTyped.finalsBytesUsed,
              finalsLimitBytes: dataTyped.finalsLimitBytes ?? old.finalsLimitBytes,
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
        // Refetch first page of gallery images query to refresh unselectedCount when order status changes
        void refetchFirstPageOnly(queryClient, (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 3 &&
            key[0] === "galleries" &&
            key[1] === "detail" &&
            key[2] === variables.galleryId &&
            key[3] === "images"
          );
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
  const { resetTimer } = useOrderStatusPolling();

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
      // Reset polling timer after successful mutation (updating order could change status)
      resetTimer();
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

      if (!result.url) {
        throw new Error("No ZIP URL available");
      }

      const filename = result.filename ?? `${variables.orderId}.zip`;

      // Trigger download using presigned URL
      const a = document.createElement("a");
      a.href = result.url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

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

      if (!result.url) {
        throw new Error("No ZIP URL available");
      }

      const filename =
        result.filename ?? `gallery-${variables.galleryId}-order-${variables.orderId}-final.zip`;

      // Trigger download using presigned URL
      const a = document.createElement("a");
      a.href = result.url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

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
  const { resetTimer } = useOrderStatusPolling();

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
      // Reset polling timer after successful mutation (uploading final photos can trigger status change)
      resetTimer();
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
      // Invalidate gallery list to refresh finalsBytesUsed for publish button state
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.lists(),
      });
      // Refetch first page of gallery images query to refresh unselectedCount when order status changes
      void refetchFirstPageOnly(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 3 &&
          key[0] === "galleries" &&
          key[1] === "detail" &&
          key[2] === variables.galleryId &&
          key[3] === "images"
        );
      });
    },
  });
}
