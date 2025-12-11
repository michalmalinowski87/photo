import { QueryClient } from "@tanstack/react-query";

import {
  clientOptions,
  dashboardStatsOptions,
  galleryDetailOptions,
  galleryListOptions,
  orderDetailOptions,
  orderListOptions,
  packageOptions,
  presignedUrlOptions,
  walletBalanceOptions,
} from "./react-query-config";

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
    infiniteList: (
      filter?: string,
      limit?: number,
      search?: string,
      sortBy?: "name" | "date" | "expiration",
      sortOrder?: "asc" | "desc"
    ) =>
      [
        ...queryKeys.galleries.lists(),
        "infinite",
        filter,
        limit,
        search,
        sortBy,
        sortOrder,
      ] as const,
    details: () => [...queryKeys.galleries.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.galleries.details(), id] as const,
    images: (id: string, type: "originals" | "finals" | "thumb" = "thumb") =>
      [...queryKeys.galleries.detail(id), "images", type] as const,
    infiniteImages: (
      id: string,
      type: "originals" | "finals" | "thumb" = "thumb",
      limit?: number,
      filterOrderId?: string,
      filterUnselected?: boolean
    ) =>
      [
        ...queryKeys.galleries.detail(id),
        "images",
        "infinite",
        type,
        limit,
        filterOrderId,
        filterUnselected,
      ] as const,
    coverPhoto: (id: string) => [...queryKeys.galleries.detail(id), "cover-photo"] as const,
    deliveredOrders: (id: string) =>
      [...queryKeys.galleries.detail(id), "delivered-orders"] as const,
    calculatePlan: (id: string, duration: string) =>
      [...queryKeys.galleries.detail(id), "calculate-plan", duration] as const,
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
    finalImagesInfinite: (galleryId: string, orderId: string) =>
      [...queryKeys.orders.detail(galleryId, orderId), "final-images", "infinite"] as const,
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
    infiniteList: (
      limit?: number,
      search?: string,
      sortBy?: "name" | "price" | "pricePerExtraPhoto" | "date",
      sortOrder?: "asc" | "desc"
    ) => [...queryKeys.packages.lists(), "infinite", limit, search, sortBy, sortOrder] as const,
    details: () => [...queryKeys.packages.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.packages.details(), id] as const,
  },
  clients: {
    all: ["clients"] as const,
    lists: () => [...queryKeys.clients.all, "list"] as const,
    list: (params?: PaginationParams) => [...queryKeys.clients.lists(), params] as const,
    infiniteList: (
      limit?: number,
      search?: string,
      sortBy?: "name" | "date",
      sortOrder?: "asc" | "desc"
    ) => [...queryKeys.clients.lists(), "infinite", limit, search, sortBy, sortOrder] as const,
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
  uploads: {
    all: ["uploads"] as const,
    presignedUrl: (galleryId: string, key: string, orderId?: string) =>
      [...queryKeys.uploads.all, "presigned-url", galleryId, key, orderId] as const,
    multipartParts: (galleryId: string, uploadId: string, key: string) =>
      [...queryKeys.uploads.all, "multipart-parts", galleryId, uploadId, key] as const,
  },
};

// QueryClient factory function - creates a new client instance
// This is important for SSR compatibility with React 19 and Next.js 15
// Each request should get its own QueryClient instance
export function makeQueryClient(): QueryClient {
  const client = new QueryClient({
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

  // Apply optimized query-specific defaults
  // These override the global defaults for specific query types
  // Note: setQueryDefaults uses query key prefixes, so we set defaults for the base keys
  client.setQueryDefaults(queryKeys.galleries.details(), galleryDetailOptions);
  client.setQueryDefaults(queryKeys.galleries.lists(), galleryListOptions);
  client.setQueryDefaults(queryKeys.orders.lists(), orderListOptions);
  client.setQueryDefaults(queryKeys.orders.details(), orderDetailOptions);
  client.setQueryDefaults(queryKeys.wallet.balance(), walletBalanceOptions);
  client.setQueryDefaults(queryKeys.uploads.all, presignedUrlOptions);
  client.setQueryDefaults(queryKeys.dashboard.stats(), dashboardStatsOptions);
  client.setQueryDefaults(queryKeys.packages.lists(), packageOptions);
  client.setQueryDefaults(queryKeys.clients.lists(), clientOptions);

  return client;
}

// Legacy export for backward compatibility (deprecated - use makeQueryClient instead)
// This is kept for any code that might still reference it directly
export const queryClient = makeQueryClient();
