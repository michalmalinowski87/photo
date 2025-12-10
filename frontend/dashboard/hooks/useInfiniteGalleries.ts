import { useInfiniteQuery, UseInfiniteQueryOptions } from "@tanstack/react-query";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { Gallery } from "../types";

interface UseInfiniteGalleriesParams {
  filter?: string;
  limit?: number;
  search?: string;
  sortBy?: "name" | "date" | "expiration";
  sortOrder?: "asc" | "desc";
  options?: Omit<
    UseInfiniteQueryOptions<{ items: Gallery[]; hasMore?: boolean; nextCursor?: string | null }>,
    "queryKey" | "queryFn" | "select"
  >;
}

export function useInfiniteGalleries({
  filter,
  limit = 50,
  search,
  sortBy,
  sortOrder,
  options,
}: UseInfiniteGalleriesParams = {}) {
  return useInfiniteQuery<{ items: Gallery[]; hasMore?: boolean; nextCursor?: string | null }>({
    queryKey: queryKeys.galleries.infiniteList(filter, limit, search, sortBy, sortOrder),
    queryFn: async ({ pageParam }) => {
      const response = await api.galleries.list(
        filter,
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

      return response;
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
