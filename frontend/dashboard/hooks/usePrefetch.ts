import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { Gallery } from "../types";

/**
 * Hook for prefetching gallery data
 * Use this to prefetch gallery details when hovering over links
 */
export function usePrefetchGallery() {
  const queryClient = useQueryClient();

  return useCallback(
    (galleryId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.galleries.detail(galleryId),
        queryFn: async () => {
          const gallery = await api.galleries.get(galleryId);
          return gallery as Gallery;
        },
        staleTime: 30 * 1000,
      });
    },
    [queryClient]
  );
}

/**
 * Hook for prefetching order data
 * Use this to prefetch order details when hovering over links
 */
export function usePrefetchOrder() {
  const queryClient = useQueryClient();

  return useCallback(
    (galleryId: string, orderId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.orders.detail(galleryId, orderId),
        queryFn: () => api.orders.get(galleryId, orderId),
        staleTime: 30 * 1000,
      });
    },
    [queryClient]
  );
}

/**
 * Hook for prefetching gallery orders list
 * Use this to prefetch orders when hovering over gallery links
 */
export function usePrefetchGalleryOrders() {
  const queryClient = useQueryClient();

  return useCallback(
    (galleryId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.orders.list(galleryId),
        queryFn: async () => {
          const response = await api.orders.getByGallery(galleryId);
          return Array.isArray(response) ? response : response.items || [];
        },
        staleTime: 30 * 1000,
      });
    },
    [queryClient]
  );
}
