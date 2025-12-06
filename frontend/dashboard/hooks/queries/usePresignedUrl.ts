import { useQuery } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

interface UsePresignedUrlParams {
  galleryId: string;
  key: string;
  contentType: string;
  fileSize: number;
  orderId?: string;
  enabled?: boolean;
}

/**
 * Query hook for getting presigned URLs for file uploads
 * 
 * Features:
 * - 5-minute staleTime (URLs expire after ~5 minutes)
 * - Proper caching to avoid unnecessary refetches
 * - Support for both regular and cover photo uploads
 * 
 * @param params - Upload parameters including galleryId, key, contentType, fileSize, and optional orderId
 * @returns React Query result with presigned URL data
 */
export function usePresignedUrl(params: UsePresignedUrlParams) {
  const { galleryId, key, contentType, fileSize, orderId, enabled = true } = params;

  return useQuery({
    queryKey: queryKeys.uploads.presignedUrl(galleryId, key, orderId),
    queryFn: async () => {
      return await api.uploads.getPresignedUrl({
        galleryId,
        key,
        contentType,
        fileSize,
        ...(orderId && { orderId }),
      });
    },
    enabled: enabled && !!galleryId && !!key && !!contentType && fileSize > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - URLs expire after ~5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes - Keep in cache longer than staleTime
    refetchOnMount: false, // Don't refetch if already cached
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
  });
}

