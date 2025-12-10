import { useInfiniteQuery, UseInfiniteQueryOptions } from "@tanstack/react-query";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";

// API response Package type (may differ from domain model)
interface Package {
  packageId: string;
  name?: string;
  includedPhotos?: number;
  pricePerExtraPhoto?: number;
  price?: number;
  createdAt?: string;
  [key: string]: unknown;
}

interface UseInfinitePackagesParams {
  limit?: number;
  search?: string;
  sortBy?: "name" | "price" | "pricePerExtraPhoto" | "date";
  sortOrder?: "asc" | "desc";
  options?: Omit<
    UseInfiniteQueryOptions<{ items: Package[]; hasMore?: boolean; nextCursor?: string | null }>,
    "queryKey" | "queryFn" | "select"
  >;
}

export function useInfinitePackages({
  limit = 20,
  search,
  sortBy,
  sortOrder,
  options,
}: UseInfinitePackagesParams = {}) {
  return useInfiniteQuery<{ items: Package[]; hasMore?: boolean; nextCursor?: string | null }>({
    queryKey: queryKeys.packages.infiniteList(limit, search, sortBy, sortOrder),
    queryFn: async ({ pageParam }) => {
      const response = await api.packages.list(
        {
          limit,
          cursor: pageParam as string | null | undefined,
        },
        search,
        sortBy,
        sortOrder
      );

      // Handle both paginated and non-paginated responses for backward compatibility
      if (Array.isArray(response)) {
        return {
          items: response,
          hasMore: false,
          nextCursor: null,
        };
      }

      return {
        items: response.items || [],
        hasMore: response.hasMore ?? false,
        nextCursor: response.nextCursor ?? null,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore && lastPage.nextCursor) {
        return lastPage.nextCursor;
      }
      return undefined;
    },
    initialPageParam: null as string | null,
    // Disable retries for infinite queries to prevent infinite loops on errors
    retry: false,
    ...options,
  });
}
