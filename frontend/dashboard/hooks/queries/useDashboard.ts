import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Order } from "../../types";

interface DashboardStats {
  deliveredOrders: number;
  clientSelectingOrders: number;
  readyToShipOrders: number;
  totalRevenue: number;
}

interface PaginationParams {
  page?: number;
  itemsPerPage?: number;
  excludeDeliveryStatus?: string;
}

export function useDashboardStats(
  options?: Omit<UseQueryOptions<DashboardStats>, "queryKey" | "queryFn">
) {
  return useQuery<DashboardStats>({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: () => api.dashboard.getStats(),
    staleTime: 30 * 1000, // Stats change moderately frequently
    ...options,
  });
}

export function useActiveOrders(
  params?: PaginationParams,
  options?: Omit<UseQueryOptions<Order[]>, "queryKey" | "queryFn">
) {
  return useQuery<Order[]>({
    queryKey: queryKeys.dashboard.activeOrders(params),
    queryFn: async () => {
      const response = await api.orders.list({
        excludeDeliveryStatus: params?.excludeDeliveryStatus ?? "DELIVERED",
        page: params?.page ?? 1,
        itemsPerPage: params?.itemsPerPage ?? 5,
      });

      // Extract orders from paginated response
      if (Array.isArray(response)) {
        return response as Order[];
      } else if (
        response &&
        typeof response === "object" &&
        "items" in response &&
        Array.isArray(response.items)
      ) {
        return response.items as Order[];
      }
      return [];
    },
    staleTime: 30 * 1000,
    ...options,
  });
}
