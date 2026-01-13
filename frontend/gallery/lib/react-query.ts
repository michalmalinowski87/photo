import { QueryClient } from "@tanstack/react-query";

// Query key factory pattern (best practice for type-safe, hierarchical keys)
export const queryKeys = {
  gallery: {
    all: ["gallery"] as const,
    detail: (id: string) => [...queryKeys.gallery.all, "detail", id] as const,
    images: (
      id: string,
      type: "thumb" | "big-thumb" | "full" = "thumb",
      limit?: number,
      offset?: number
    ) =>
      [
        ...queryKeys.gallery.detail(id),
        "images",
        type,
        limit,
        offset,
      ] as const,
    infiniteImages: (
      id: string,
      type: "thumb" | "big-thumb" | "full" = "thumb",
      limit?: number
    ) =>
      [
        ...queryKeys.gallery.detail(id),
        "images",
        "infinite",
        type,
        limit,
      ] as const,
    status: (id: string) => [...queryKeys.gallery.detail(id), "status"] as const,
  },
};

// QueryClient factory function - creates a new client instance
// This is important for SSR compatibility with React 19 and Next.js 15
// Each request should get its own QueryClient instance
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes (images don't change often)
        staleTime: 5 * 60 * 1000,
        // Cache data for 30 minutes after last use
        gcTime: 30 * 60 * 1000,
        // Don't refetch on window focus (avoid unnecessary requests)
        refetchOnWindowFocus: false,
        // Refetch on reconnect only when connection restored
        refetchOnReconnect: true,
        // Retry failed requests 2 times with exponential backoff
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Enable structural sharing (prevents unnecessary re-renders)
        structuralSharing: true,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
      },
    },
  });
}

// Legacy export for backward compatibility
export const queryClient = makeQueryClient();
