import { useInfiniteQuery, UseInfiniteQueryOptions } from "@tanstack/react-query";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { Gallery } from "../types";

interface UseInfiniteGalleriesParams {
  filter?: string;
  limit?: number;
  options?: Omit<
    UseInfiniteQueryOptions<{ items: Gallery[]; hasMore?: boolean; nextCursor?: string | null }>,
    "queryKey" | "queryFn"
  >;
}

export function useInfiniteGalleries({
  filter,
  limit = 50,
  options,
}: UseInfiniteGalleriesParams = {}) {
  return useInfiniteQuery<{ items: Gallery[]; hasMore?: boolean; nextCursor?: string | null }>({
    queryKey: queryKeys.galleries.infiniteList(filter, limit),
    queryFn: async ({ pageParam }) => {
      const response = await api.galleries.list(filter, {
        limit,
        cursor: pageParam as string | null | undefined,
      });
      
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
    ...options,
  });
}

