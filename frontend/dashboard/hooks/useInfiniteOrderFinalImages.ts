import { useInfiniteQuery, UseInfiniteQueryOptions } from "@tanstack/react-query";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import type { GalleryImage } from "../types";

interface UseInfiniteOrderFinalImagesParams {
  galleryId: string | undefined;
  orderId: string | undefined;
  options?: Omit<
    UseInfiniteQueryOptions<{
      images: GalleryImage[];
      hasMore?: boolean;
      nextCursor?: string | null;
    }>,
    "queryKey" | "queryFn" | "getNextPageParam" | "initialPageParam"
  >;
}

export function useInfiniteOrderFinalImages({
  galleryId,
  orderId,
  options,
}: UseInfiniteOrderFinalImagesParams) {
  return useInfiniteQuery<{
    images: GalleryImage[];
    hasMore?: boolean;
    nextCursor?: string | null;
  }>({
    queryKey: queryKeys.orders.finalImagesInfinite(galleryId ?? "", orderId ?? ""),
    queryFn: async ({ pageParam: _pageParam }) => {
      if (!galleryId || !orderId) {
        throw new Error("Gallery ID and Order ID are required");
      }
      const response = await api.orders.getFinalImages(galleryId, orderId);

      // Handle backward compatibility - if response doesn't have expected structure
      if (!response || typeof response !== "object") {
        return {
          images: [],
          hasMore: false,
          nextCursor: null,
        };
      }

      // Safely extract images array
      const imagesArray = Array.isArray(response.images) ? response.images : [];
      const images = imagesArray.map((img: any) => ({
        ...img,
        url: img.thumbUrl ?? img.previewUrl ?? img.finalUrl ?? img.url ?? "",
        finalUrl: img.finalUrl ?? img.url ?? "",
      }));

      // Return as a single page since backend doesn't support pagination
      return {
        images: images || [],
        hasMore: false,
        nextCursor: null,
      };
    },
    getNextPageParam: () => undefined, // No pagination support
    initialPageParam: null as string | null,
    enabled: !!galleryId && !!orderId,
    // Disable retries for infinite queries to prevent infinite loops on errors
    retry: false,
    // Default staleTime if not provided in options - helps with caching
    staleTime: 30 * 60 * 1000, // 30 minutes default - can be overridden in options
    // Default gcTime if not provided
    gcTime: 60 * 60 * 1000, // 60 minutes default - can be overridden in options
    ...options,
  });
}
