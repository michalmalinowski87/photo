import { QueryClient } from "@tanstack/react-query";

interface PaginationParams {
  limit?: string | number;
  offset?: string | number;
  lastKey?: string;
  page?: string | number;
  itemsPerPage?: string | number;
  search?: string;
  excludeDeliveryStatus?: string;
}

// Query key factory pattern (best practice for type-safe, hierarchical keys)
export const queryKeys = {
  galleries: {
    all: ["galleries"] as const,
    lists: () => [...queryKeys.galleries.all, "list"] as const,
    list: (filter?: string) => [...queryKeys.galleries.lists(), filter] as const,
    details: () => [...queryKeys.galleries.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.galleries.details(), id] as const,
    images: (id: string, type: "originals" | "finals" | "thumb" = "thumb") =>
      [...queryKeys.galleries.detail(id), "images", type] as const,
    status: (id: string) => [...queryKeys.galleries.detail(id), "status"] as const,
    bytesUsed: (id: string) => [...queryKeys.galleries.detail(id), "bytes-used"] as const,
    coverPhoto: (id: string) => [...queryKeys.galleries.detail(id), "cover-photo"] as const,
    deliveredOrders: (id: string) => [...queryKeys.galleries.detail(id), "delivered-orders"] as const,
  },
  orders: {
    all: ["orders"] as const,
    lists: () => [...queryKeys.orders.all, "list"] as const,
    list: (galleryId?: string) => [...queryKeys.orders.lists(), galleryId] as const,
    details: () => [...queryKeys.orders.all, "detail"] as const,
    detail: (galleryId: string, orderId: string) =>
      [...queryKeys.orders.details(), galleryId, orderId] as const,
    byGallery: (galleryId: string) => [...queryKeys.orders.list(galleryId)] as const,
    finalImages: (galleryId: string, orderId: string) =>
      [...queryKeys.orders.detail(galleryId, orderId), "final-images"] as const,
  },
  wallet: {
    all: ["wallet"] as const,
    balance: () => [...queryKeys.wallet.all, "balance"] as const,
    transactions: (params?: PaginationParams) =>
      [...queryKeys.wallet.all, "transactions", params] as const,
  },
  packages: {
    all: ["packages"] as const,
    lists: () => [...queryKeys.packages.all, "list"] as const,
    list: () => [...queryKeys.packages.lists()] as const,
    details: () => [...queryKeys.packages.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.packages.details(), id] as const,
  },
  clients: {
    all: ["clients"] as const,
    lists: () => [...queryKeys.clients.all, "list"] as const,
    list: (params?: PaginationParams) => [...queryKeys.clients.lists(), params] as const,
    details: () => [...queryKeys.clients.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.clients.details(), id] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    stats: () => [...queryKeys.dashboard.all, "stats"] as const,
    activeOrders: (params?: PaginationParams) =>
      [...queryKeys.dashboard.all, "activeOrders", params] as const,
  },
  auth: {
    all: ["auth"] as const,
    businessInfo: () => [...queryKeys.auth.all, "businessInfo"] as const,
  },
};

// QueryClient configuration with best practices
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30 seconds (no refetch)
      staleTime: 30 * 1000,
      // Cache data for 5 minutes after last use
      gcTime: 5 * 60 * 1000, // Previously cacheTime
      // Refetch on window focus only if data is stale
      refetchOnWindowFocus: true,
      // Don't refetch on reconnect by default (can be overridden per query)
      refetchOnReconnect: false,
      // Retry failed requests 1 time
      retry: 1,
      // Retry delay increases exponentially
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Enable structural sharing (default in v5, but explicit is better)
      // Prevents unnecessary re-renders when data structure changes but values are the same
      structuralSharing: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});
