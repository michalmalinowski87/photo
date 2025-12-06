import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Order } from "../../store/orderSlice";

export function useOrders(
  galleryId?: string,
  options?: Omit<UseQueryOptions<Order[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.orders.list(galleryId),
    queryFn: async () => {
      const response = galleryId
        ? await api.orders.getByGallery(galleryId)
        : await api.orders.list();
      return Array.isArray(response) ? response : response.items || [];
    },
    enabled: !galleryId || !!galleryId, // Always enabled
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useOrder(
  galleryId: string | undefined,
  orderId: string | undefined,
  options?: Omit<UseQueryOptions<Order>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.orders.detail(galleryId!, orderId!),
    queryFn: () => api.orders.get(galleryId!, orderId!),
    enabled: !!galleryId && !!orderId,
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useOrderFinalImages(
  galleryId: string | undefined,
  orderId: string | undefined,
  options?: Omit<UseQueryOptions<any[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.orders.finalImages(galleryId!, orderId!),
    queryFn: async () => {
      const response = await api.orders.getFinalImages(galleryId!, orderId!);
      return response.images || [];
    },
    enabled: !!galleryId && !!orderId,
    staleTime: 30 * 1000,
    ...options,
  });
}

// Order status (lightweight)
export function useOrderStatus(galleryId: string | undefined, orderId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.orders.detail(galleryId!, orderId!), "status"],
    queryFn: () => api.orders.getOrderStatus(galleryId!, orderId!),
    enabled: !!galleryId && !!orderId,
    staleTime: 10 * 1000, // Status changes more frequently
  });
}
