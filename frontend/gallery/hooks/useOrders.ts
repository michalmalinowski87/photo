"use client";

import { useQuery, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/react-query";
import { getToken } from "@/lib/token";
import { getPublicApiUrl } from "@/lib/public-env";
import type { DeliveredOrder, DeliveredOrdersResponse, ClientApprovedOrder, ClientApprovedOrdersResponse, ImageData } from "@/types/gallery";
import { useRef, useEffect } from "react";

const API_URL = getPublicApiUrl();

export function useDeliveredOrders(galleryId: string | null) {
  return useQuery({
    queryKey: ["orders", "delivered", galleryId],
    queryFn: async () => {
      if (!galleryId) {
        throw new Error("Missing galleryId");
      }

      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      const response = await apiFetch(`${API_URL}/galleries/${galleryId}/orders/delivered`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data as DeliveredOrdersResponse;
    },
    enabled: !!galleryId && !!getToken(galleryId),
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

export function useClientApprovedOrders(galleryId: string | null) {
  return useQuery({
    queryKey: ["orders", "client-approved", galleryId],
    queryFn: async () => {
      if (!galleryId) {
        throw new Error("Missing galleryId");
      }

      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      const response = await apiFetch(`${API_URL}/galleries/${galleryId}/orders/client-approved`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data as ClientApprovedOrdersResponse;
    },
    enabled: !!galleryId && !!getToken(galleryId),
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
    finalUrl?: string;
    finalUrlFallback?: string;
    previewUrl?: string;
    previewUrlFallback?: string;
    bigThumbUrl?: string;
    bigThumbUrlFallback?: string;
    thumbUrl?: string;
    thumbUrlFallback?: string;
    size?: number;
    lastModified?: string;
    width?: number;
    height?: number;
  }>;
  count: number;
  totalCount: number;
  totalBytes?: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

interface FinalImagesResponse {
  images: ImageData[];
  hasMore: boolean;
  nextCursor?: string | null;
  totalCount: number;
  totalBytes?: number;
}

export function useFinalImages(
  galleryId: string | null,
  orderId: string | null,
  limit: number = 50
) {
  const queryKey = ["orders", "final", "images", galleryId, orderId, limit];
  const prevOrderIdRef = useRef<string | null>(orderId);
  const placeholderDataOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevOrderIdRef.current !== orderId) {
      prevOrderIdRef.current = orderId;
      // Clear placeholder data orderId when orderId changes to prevent showing stale data
      placeholderDataOrderIdRef.current = null;
    }
  }, [orderId]);

  return useInfiniteQuery<
    FinalImagesResponse,
    unknown,
    InfiniteData<FinalImagesResponse>,
    typeof queryKey,
    string | null
  >({
    queryKey,
    queryFn: async ({ pageParam = null }) => {
      if (!galleryId || !orderId) {
        throw new Error("Missing galleryId or orderId");
      }

      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
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
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const apiData = response.data as FinalImagesApiResponse;

      const mappedImages: ImageData[] = apiData.images.map((img) => ({
        key: img.key,
        // Use finalUrl for display and download (finals storage, not originals)
        url: img.finalUrl || img.finalUrlFallback || '',
        finalUrl: img.finalUrl || img.finalUrlFallback,
        previewUrl: img.previewUrl || img.previewUrlFallback,
        previewUrlFallback: img.previewUrlFallback,
        thumbnailUrl: img.thumbUrl || img.thumbUrlFallback,
        thumbUrl: img.thumbUrl || img.thumbUrlFallback,
        thumbUrlFallback: img.thumbUrlFallback,
        bigThumbUrl: img.bigThumbUrl || img.bigThumbUrlFallback,
        bigThumbUrlFallback: img.bigThumbUrlFallback,
        lastModified: img.lastModified,
        size: img.size,
        width: img.width,
        height: img.height,
        alt: img.key,
      }));

      const result = {
        images: mappedImages,
        hasMore: apiData.hasMore,
        nextCursor: apiData.nextCursor,
        totalCount: apiData.totalCount,
        totalBytes: apiData.totalBytes,
      } as FinalImagesResponse;
      
      // Track that we successfully fetched data for this orderId
      placeholderDataOrderIdRef.current = orderId;
      
      return result;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore && lastPage.nextCursor) {
        return lastPage.nextCursor;
      }
      return undefined;
    },
    initialPageParam: null as string | null,
    enabled: !!galleryId && !!orderId && !!getToken(galleryId),
    placeholderData: (previousData) => {
      // Only use placeholder data if it's for the current orderId
      // When orderId changes, placeholderDataOrderIdRef.current is cleared in useEffect,
      // preventing stale data from a different order from being shown
      if (previousData && placeholderDataOrderIdRef.current === orderId) {
        return previousData;
      }
      
      // Reject placeholder data if it's for a different orderId or if orderId just changed
      return undefined;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
