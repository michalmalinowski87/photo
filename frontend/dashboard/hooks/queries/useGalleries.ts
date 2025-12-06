import { useQuery, UseQueryOptions } from "@tanstack/react-query";

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
  options?: Omit<UseQueryOptions<Gallery>, "queryKey" | "queryFn">
) {
  return useQuery<Gallery>({
    queryKey: queryKeys.galleries.detail(galleryId!),
    queryFn: async () => {
      const gallery = await api.galleries.get(galleryId!);
      return gallery as Gallery;
    },
    enabled: !!galleryId, // Only run if galleryId exists
    staleTime: 30 * 1000,
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
