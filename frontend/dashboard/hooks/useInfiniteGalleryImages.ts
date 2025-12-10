import { useInfiniteQuery, UseInfiniteQueryOptions } from "@tanstack/react-query";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { GalleryImage } from "../types";

interface UseInfiniteGalleryImagesParams {
  galleryId: string | undefined;
  type?: "originals" | "finals" | "thumb";
  limit?: number;
  filterOrderId?: string; // Filter by specific order ID
  filterUnselected?: boolean; // Filter only unselected images
  options?: Omit<
    UseInfiniteQueryOptions<{
      images: GalleryImage[];
      hasMore?: boolean;
      nextCursor?: string | null;
    }>,
    "queryKey" | "queryFn"
  >;
}

export function useInfiniteGalleryImages({
  galleryId,
  type = "thumb",
  limit = 50,
  filterOrderId,
  filterUnselected,
  options,
}: UseInfiniteGalleryImagesParams) {
  return useInfiniteQuery<{
    images: GalleryImage[];
    hasMore?: boolean;
    nextCursor?: string | null;
    totalCount?: number;
    stats?: {
      totalCount: number;
      orderCounts?: Array<{ orderId: string; count: number }>;
      unselectedCount?: number;
    };
  }>({
    queryKey: queryKeys.galleries.infiniteImages(
      galleryId ?? "",
      type,
      limit,
      filterOrderId,
      filterUnselected
    ),
    queryFn: async ({ pageParam }) => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      const response = await api.galleries.getImages(
        galleryId,
        type,
        {
          limit,
          cursor: pageParam as string | null | undefined,
        },
        filterOrderId,
        filterUnselected
      );

      // Handle backward compatibility - if response doesn't have pagination fields
      if (response.images && !("hasMore" in response)) {
        return {
          images: response.images,
          hasMore: false,
          nextCursor: null,
          totalCount: (response as any).totalCount,
          stats: (response as any).stats,
        };
      }

      return {
        images: response.images || [],
        hasMore: response.hasMore,
        nextCursor: response.nextCursor,
        totalCount: (response as any).totalCount,
        stats: (response as any).stats,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore && lastPage.nextCursor) {
        return lastPage.nextCursor;
      }
      return undefined;
    },
    initialPageParam: null as string | null,
    enabled: !!galleryId,
    // Disable retries for infinite queries to prevent infinite loops on errors
    retry: false,
    // Default staleTime if not provided in options - helps with caching
    staleTime: 30 * 60 * 1000, // 30 minutes default - can be overridden in options
    // Default gcTime if not provided
    gcTime: 60 * 60 * 1000, // 60 minutes default - can be overridden in options
    ...options,
  });
}
