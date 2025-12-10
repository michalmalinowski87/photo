import { useInfiniteQuery, UseInfiniteQueryOptions } from "@tanstack/react-query";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";

interface Client {
  clientId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isCompany?: boolean;
  companyName?: string;
  nip?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface UseInfiniteClientsParams {
  limit?: number;
  search?: string;
  sortBy?: "name" | "date";
  sortOrder?: "asc" | "desc";
  options?: Omit<
    UseInfiniteQueryOptions<{ items: Client[]; hasMore?: boolean; lastKey?: string | null }>,
    "queryKey" | "queryFn"
  >;
}

export function useInfiniteClients({
  limit = 20,
  search,
  sortBy,
  sortOrder,
  options,
}: UseInfiniteClientsParams = {}) {
  return useInfiniteQuery<{
    items: Client[];
    hasMore?: boolean;
    lastKey?: string | null;
    nextOffset?: number;
  }>({
    queryKey: queryKeys.clients.infiniteList(limit, search, sortBy, sortOrder),
    queryFn: async ({ pageParam }) => {
      const params: any = {
        limit: limit.toString(),
        sortBy,
        sortOrder,
      };

      let currentOffset = 0;
      if (search) {
        params.search = search;
        // For search, use offset-based pagination
        currentOffset = pageParam ? parseInt(pageParam as string, 10) : 0;
        params.offset = currentOffset.toString();
      } else {
        // For non-search, use cursor-based pagination
        if (pageParam) {
          params.lastKey = pageParam as string;
        }
      }

      const response = await api.clients.list(params);

      // Handle both paginated and non-paginated responses for backward compatibility
      if (Array.isArray(response)) {
        return {
          items: response,
          hasMore: false,
          lastKey: null,
          nextOffset: undefined,
        };
      }

      return {
        items: response.items || [],
        hasMore: response.hasMore ?? false,
        lastKey: response.lastKey ?? null,
        nextOffset: search ? currentOffset + (response.items?.length || 0) : undefined,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) {
        // For search, return the next offset
        if (search && lastPage.nextOffset !== undefined) {
          return lastPage.nextOffset.toString();
        }
        // For non-search, return the lastKey
        return lastPage.lastKey ?? undefined;
      }
      return undefined;
    },
    initialPageParam: null as string | null,
    // Disable retries for infinite queries to prevent infinite loops on errors
    retry: false,
    ...options,
  });
}
