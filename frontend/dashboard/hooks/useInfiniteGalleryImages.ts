import { useInfiniteQuery, UseInfiniteQueryOptions } from "@tanstack/react-query";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { GalleryImage } from "../types";

interface UseInfiniteGalleryImagesParams {
  galleryId: string | undefined;
  type?: "originals" | "finals" | "thumb";
  limit?: number;
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
  options,
}: UseInfiniteGalleryImagesParams) {
  return useInfiniteQuery<{
    images: GalleryImage[];
    hasMore?: boolean;
    nextCursor?: string | null;
  }>({
    queryKey: queryKeys.galleries.infiniteImages(galleryId ?? "", type, limit),
    queryFn: async ({ pageParam }) => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      const response = await api.galleries.getImages(galleryId, type, {
        limit,
        cursor: pageParam as string | null | undefined,
      });

      // Handle backward compatibility - if response doesn't have pagination fields
      if (response.images && !("hasMore" in response)) {
        return {
          images: response.images,
          hasMore: false,
          nextCursor: null,
        };
      }

      return {
        images: response.images || [],
        hasMore: response.hasMore,
        nextCursor: response.nextCursor,
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
    ...options,
  });
}

