import { useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Order } from "../../types";

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
    // Only fetch if galleryId is provided (for gallery-specific orders)
    // or if no galleryId (for all orders)
    enabled: true,
    ...options,
  });
}

export function useOrder(
  galleryId: string | undefined,
  orderId: string | undefined,
  options?: Omit<UseQueryOptions<Order>, "queryKey" | "queryFn" | "placeholderData" | "initialData">
) {
  const queryClient = useQueryClient();

  // Try to get order from list cache to use as initialData
  // This provides instant display when navigating from a list
  const getInitialData = (): Order | undefined => {
    if (!galleryId || !orderId) return undefined;

    // Check gallery-specific orders list first
    const galleryOrdersQuery = queryClient.getQueryData<Order[]>(queryKeys.orders.list(galleryId));
    if (galleryOrdersQuery) {
      const orderFromList = galleryOrdersQuery.find((o) => o.orderId === orderId);
      if (orderFromList) {
        return orderFromList;
      }
    }

    // Check all orders list
    const allOrdersQuery = queryClient.getQueryData<Order[]>(queryKeys.orders.list());
    if (allOrdersQuery) {
      const orderFromList = allOrdersQuery.find(
        (o) => o.orderId === orderId && o.galleryId === galleryId
      );
      if (orderFromList) {
        return orderFromList;
      }
    }

    return undefined;
  };

  const initialData = getInitialData();

  return useQuery({
    queryKey: queryKeys.orders.detail(galleryId!, orderId!),
    queryFn: () => api.orders.get(galleryId!, orderId!),
    enabled: !!galleryId && !!orderId,
    // Use data from list cache as initialData for instant display
    initialData,
    // Keep previous data while loading new order for smoother transitions
    placeholderData: (previousData) => previousData,
    ...options,
  });
}

export function useOrderFinalImages(
  galleryId: string | undefined,
  orderId: string | undefined,
  options?: Omit<UseQueryOptions<any[]>, "queryKey" | "queryFn" | "select">
) {
  return useQuery({
    queryKey: queryKeys.orders.finalImages(galleryId!, orderId!),
    queryFn: async () => {
      const response = await api.orders.getFinalImages(galleryId!, orderId!);
      return response.images || [];
    },
    enabled: !!galleryId && !!orderId,
    // Transform data at query level for better memoization
    select: (data) =>
      data.map((img: any) => ({
        ...img,
        url: img.thumbUrl ?? img.previewUrl ?? img.finalUrl ?? img.url ?? "",
        finalUrl: img.finalUrl ?? img.url ?? "",
      })),
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
    networkMode: "offlineFirst", // Use cache if offline
  });
}
