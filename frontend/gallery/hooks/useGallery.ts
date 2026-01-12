"use client";

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
  token: string,
  type: "thumb" | "big-thumb" = "thumb",
  limit: number = 50
) {
  return useInfiniteQuery({
    queryKey: queryKeys.gallery.infiniteImages(galleryId, type, limit),
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
            Authorization: `Bearer ${token}`,
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
    enabled: !!galleryId && !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
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
