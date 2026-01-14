"use client";

import { useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/react-query";
import type { DeliveredOrder, DeliveredOrdersResponse, ImageData } from "@/types/gallery";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useDeliveredOrders(galleryId: string | null, token: string | null) {
  const effectiveToken = useMemo(() => {
    if (token) return token;
    if (typeof window !== "undefined" && galleryId) {
      const storedToken = sessionStorage.getItem(`gallery_token_${galleryId}`);
      return storedToken || null;
    }
    return null;
  }, [token, galleryId]);

  return useQuery({
    queryKey: ["orders", "delivered", galleryId],
    queryFn: async () => {
      if (!galleryId || !effectiveToken) {
        throw new Error("Missing galleryId or token");
      }

      const response = await apiFetch(`${API_URL}/galleries/${galleryId}/orders/delivered`, {
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
        },
      });

      return response.data as DeliveredOrdersResponse;
    },
    enabled: !!galleryId && !!effectiveToken,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      if (error?.status === 401 || error?.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

interface FinalImagesApiResponse {
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

interface FinalImagesResponse {
  images: ImageData[];
  hasMore: boolean;
  nextCursor?: string | null;
}

export function useFinalImages(
  galleryId: string | null,
  orderId: string | null,
  token: string | null,
  limit: number = 50
) {
  const effectiveToken = useMemo(() => {
    if (token) return token;
    if (typeof window !== "undefined" && galleryId) {
      const storedToken = sessionStorage.getItem(`gallery_token_${galleryId}`);
      return storedToken || null;
    }
    return null;
  }, [token, galleryId]);

  const queryKey = ["orders", "final", "images", galleryId, orderId, limit];

  return useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = null }) => {
      if (!galleryId || !orderId || !effectiveToken) {
        throw new Error("Missing galleryId, orderId, or token");
      }

      const params = new URLSearchParams({
        limit: limit.toString(),
      });

      if (pageParam) {
        params.append("cursor", pageParam);
      }

      const response = await apiFetch(
        `${API_URL}/galleries/${galleryId}/orders/${orderId}/final/images?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
          },
        }
      );

      const apiData = response.data as FinalImagesApiResponse;

      const mappedImages: ImageData[] = apiData.images.map((img) => ({
        key: img.key,
        url: img.url,
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
      } as FinalImagesResponse;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore && lastPage.nextCursor) {
        return lastPage.nextCursor;
      }
      return undefined;
    },
    initialPageParam: null as string | null,
    enabled: !!galleryId && !!orderId && !!effectiveToken,
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
