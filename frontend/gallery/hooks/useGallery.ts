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
  
  // Get token from sessionStorage as fallback if token prop is null (handles race condition)
  const effectiveToken = useMemo(() => {
    if (token) return token;
    if (typeof window !== "undefined" && galleryId) {
      const storedToken = sessionStorage.getItem(`gallery_token_${galleryId}`);
      return storedToken || null;
    }
    return null;
  }, [token, galleryId]);
  
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

      // Use effectiveToken which includes sessionStorage fallback
      const tokenToUse = effectiveToken || token;
      if (!tokenToUse) {
        throw new Error("No token available");
      }

      const response = await apiFetch(
        `${API_URL}/galleries/${galleryId}/images?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
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
    enabled: !!galleryId && !!effectiveToken, // Use effectiveToken which includes sessionStorage fallback
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

interface GalleryStatusResponse {
  state: string;
  paymentStatus: string;
  isPaid: boolean;
  galleryName: string | null;
}

export function useGalleryStatus(galleryId: string | null, token: string | null) {
  // Get token from sessionStorage as fallback if token prop is null (handles race condition on refresh)
  const effectiveToken = useMemo(() => {
    if (token) return token;
    if (typeof window !== "undefined" && galleryId) {
      const storedToken = sessionStorage.getItem(`gallery_token_${galleryId}`);
      return storedToken || null;
    }
    return null;
  }, [token, galleryId]);

  // Get gallery name from sessionStorage as initial/fallback data
  const initialData = useMemo(() => {
    if (typeof window !== "undefined" && galleryId) {
      const storedName = sessionStorage.getItem(`gallery_name_${galleryId}`);
      if (storedName) {
        return {
          state: "PAID_ACTIVE",
          paymentStatus: "PAID",
          isPaid: true,
          galleryName: storedName,
        } as GalleryStatusResponse;
      }
    }
    return undefined;
  }, [galleryId]);

  return useQuery({
    queryKey: queryKeys.gallery.status(galleryId || ""),
    queryFn: async () => {
      if (!galleryId || !effectiveToken) {
        // Return cached/initial data if available instead of throwing
        if (initialData) return initialData;
        throw new Error("Missing galleryId or token");
      }
      
      try {
        const response = await apiFetch(`${API_URL}/galleries/${galleryId}/status`, {
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
          },
        });
        
        // Store gallery name in sessionStorage for persistence across refreshes
        if (response.data?.galleryName && typeof window !== "undefined") {
          sessionStorage.setItem(`gallery_name_${galleryId}`, response.data.galleryName);
        }
        
        return response.data as GalleryStatusResponse;
      } catch (error: any) {
        // On 401/403 errors, return cached data if available instead of failing
        if ((error.status === 401 || error.status === 403) && initialData) {
          return initialData;
        }
        throw error;
      }
    },
    enabled: !!galleryId && !!effectiveToken, // Use effectiveToken which includes sessionStorage fallback
    staleTime: 2 * 60 * 1000, // 2 minutes - refresh more frequently for name updates
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false, // Don't refetch on focus to avoid 401 errors
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors (401, 403)
      if (error?.status === 401 || error?.status === 403) {
        return false;
      }
      // Retry other errors up to 2 times
      return failureCount < 2;
    },
    // Use sessionStorage data as initial data, then React Query cache as fallback
    initialData,
    placeholderData: (previousData) => previousData || initialData,
  });
}
