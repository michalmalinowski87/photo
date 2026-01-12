"use client";

import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/react-query";
import type { ImageData, GalleryInfo } from "@/types/gallery";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface GalleryImagesApiResponse {
  galleryId: string;
  images: Array<{
    key: string;
    previewUrl?: string;
    previewUrlFallback?: string;
    bigThumbUrl?: string;
    bigThumbUrlFallback?: string;
    thumbUrl?: string;
    thumbUrlFallback?: string;
    url: string;
    size?: number;
    lastModified?: string;
    width?: number;
    height?: number;
  }>;
  count: number;
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

interface GalleryImagesResponse {
  images: ImageData[];
  hasMore: boolean;
  nextCursor?: string | null;
}

export function useGalleryImages(
  galleryId: string,
  token: string | null,
  type: "thumb" | "big-thumb" = "thumb",
  limit: number = 50
) {
  const queryKey = queryKeys.gallery.infiniteImages(galleryId, type, limit);
  
  // Read token directly from localStorage (source of truth) to avoid query resets when AuthProvider temporarily clears token
  // This ensures the query stays enabled and doesn't lose cached data
  // Using useMemo to avoid reading from localStorage on every render
  // Fallback to token prop if localStorage doesn't have it (handles initial load)
  const stableToken = useMemo(() => {
    if (typeof window !== 'undefined' && galleryId) {
      const storedToken = localStorage.getItem(`gallery_token_${galleryId}`);
      // Use stored token if available, otherwise fall back to token prop
      return storedToken || token;
    }
    return token;
  }, [galleryId, token]);
  
  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = null }) => {
      // Build query parameters
      const sizes = "thumb,preview,bigthumb";
      const params = new URLSearchParams({
        sizes,
        limit: limit.toString(),
        filterUnselected: "true",
      });
      
      // Add cursor if we have one
      if (pageParam) {
        params.append("cursor", pageParam);
      }

      const response = await apiFetch(
        `${API_URL}/galleries/${galleryId}/images?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${stableToken}`,
          },
        }
      );

      const apiData = response.data as GalleryImagesApiResponse;

      // Map API response to our ImageData format
      const mappedImages: ImageData[] = apiData.images.map((img) => ({
        key: img.key,
        url: img.url, // Full quality URL
        previewUrl: img.previewUrl || img.previewUrlFallback,
        thumbnailUrl: img.thumbUrl || img.thumbUrlFallback,
        thumbUrl: img.thumbUrl || img.thumbUrlFallback,
        bigThumbUrl: img.bigThumbUrl || img.bigThumbUrlFallback,
        width: img.width,
        height: img.height,
        alt: img.key,
      }));

      return {
        images: mappedImages,
        hasMore: apiData.hasMore,
        nextCursor: apiData.nextCursor,
      } as GalleryImagesResponse;
    },
    getNextPageParam: (lastPage) => {
      // Return nextCursor if hasMore is true, otherwise undefined to stop pagination
      if (lastPage.hasMore && lastPage.nextCursor) {
        return lastPage.nextCursor;
      }
      return undefined;
    },
    initialPageParam: null as string | null,
    enabled: !!galleryId && !!stableToken, // Require both galleryId and token, but stableToken comes from localStorage (persistent)
    placeholderData: (previousData) => previousData, // Keep previous data when query is disabled/refetching
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // Expose prefetch function for proactive loading
  const prefetchNextPage = async () => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      await query.fetchNextPage();
      // React Query automatically updates the cache and triggers re-renders
    }
  };

  return {
    ...query,
    prefetchNextPage,
  };
}

export function useGalleryInfo(galleryId: string, token: string) {
  return useQuery({
    queryKey: queryKeys.gallery.detail(galleryId),
    queryFn: async () => {
      const response = await apiFetch(`${API_URL}/galleries/${galleryId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data as GalleryInfo;
    },
    enabled: !!galleryId && !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
