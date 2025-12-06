import { useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Gallery } from "../../store/gallerySlice";

// List galleries with optional filter
export function useGalleries(
  filter?: string,
  options?: Omit<UseQueryOptions<Gallery[]>, "queryKey" | "queryFn">
) {
  return useQuery<Gallery[]>({
    queryKey: queryKeys.galleries.list(filter),
    queryFn: async () => {
      const response = await api.galleries.list(filter);
      const galleries = Array.isArray(response) ? response : response.items || [];
      return galleries as Gallery[];
    },
    staleTime: 30 * 1000,
    ...options,
  });
}

// Single gallery detail
export function useGallery(
  galleryId: string | undefined,
  options?: Omit<
    UseQueryOptions<Gallery>,
    "queryKey" | "queryFn" | "placeholderData" | "initialData"
  >
) {
  const queryClient = useQueryClient();

  // Try to get gallery from list cache to use as initialData
  // This provides instant display when navigating from a list
  const getInitialData = (): Gallery | undefined => {
    if (!galleryId) return undefined;

    // Check all list queries for this gallery
    const listQueries = queryClient.getQueriesData<Gallery[]>({
      queryKey: queryKeys.galleries.lists(),
    });

    for (const [, galleries] of listQueries) {
      if (galleries) {
        const galleryFromList = galleries.find((g) => g.galleryId === galleryId);
        if (galleryFromList) {
          return galleryFromList;
        }
      }
    }

    return undefined;
  };

  const initialData = getInitialData();

  return useQuery<Gallery>({
    queryKey: queryKeys.galleries.detail(galleryId!),
    queryFn: async () => {
      const gallery = await api.galleries.get(galleryId!);
      return gallery as Gallery;
    },
    enabled: !!galleryId, // Only run if galleryId exists
    staleTime: 30 * 1000,
    // Use data from list cache as initialData for instant display
    initialData,
    // Keep previous data while loading new gallery for smoother transitions
    placeholderData: (previousData) => previousData,
    ...options,
  });
}

// Gallery images (originals, finals, or thumbnails)
export function useGalleryImages(
  galleryId: string | undefined,
  type: "originals" | "finals" | "thumb" = "thumb",
  options?: Omit<UseQueryOptions<any[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.galleries.images(galleryId!, type),
    queryFn: async () => {
      const response = await api.galleries.getImages(galleryId!, type);
      return response.images || [];
    },
    enabled: !!galleryId,
    staleTime: 30 * 1000,
    ...options,
  });
}

// Gallery status (lightweight)
export function useGalleryStatus(galleryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.galleries.status(galleryId!),
    queryFn: () => api.galleries.getStatus(galleryId!),
    enabled: !!galleryId,
    staleTime: 10 * 1000, // Status changes more frequently
    networkMode: "offlineFirst", // Use cache if offline
  });
}

// Gallery bytes used
export function useGalleryBytesUsed(galleryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.galleries.bytesUsed(galleryId!),
    queryFn: () => api.galleries.getBytesUsed(galleryId!),
    enabled: !!galleryId,
    staleTime: 30 * 1000,
  });
}

// Gallery cover photo
export function useGalleryCoverPhoto(galleryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.galleries.coverPhoto(galleryId!),
    queryFn: () => api.galleries.getCoverPhoto(galleryId!),
    enabled: !!galleryId,
    staleTime: 30 * 1000,
  });
}

// Gallery delivered orders
export function useGalleryDeliveredOrders(galleryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.galleries.deliveredOrders(galleryId!),
    queryFn: () => api.galleries.checkDeliveredOrders(galleryId!),
    enabled: !!galleryId,
    staleTime: 30 * 1000,
    select: (data) => {
      return Array.isArray(data) ? data : data.items || [];
    },
  });
}
