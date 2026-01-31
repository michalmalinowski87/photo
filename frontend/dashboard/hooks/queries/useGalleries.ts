import { useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Gallery, GalleryImage } from "../../types";

export function useGalleries(
  filter?: string,
  search?: string,
  sortBy?: "name" | "date" | "expiration",
  sortOrder?: "asc" | "desc",
  options?: Omit<UseQueryOptions<Gallery[]>, "queryKey" | "queryFn">
) {
  return useQuery<Gallery[]>({
    queryKey: [...queryKeys.galleries.list(filter), search, sortBy, sortOrder],
    queryFn: async () => {
      const response = await api.galleries.list(filter, undefined, search, sortBy, sortOrder);
      const galleries = Array.isArray(response) ? response : response.items || [];
      return galleries as Gallery[];
    },
    ...options,
  });
}

export function useGallery(
  galleryId: string | undefined,
  options?: Omit<
    UseQueryOptions<Gallery>,
    "queryKey" | "queryFn" | "placeholderData" | "initialData"
  >
) {
  const queryClient = useQueryClient();

  // Try to get gallery from list cache to use as initialData for instant display when navigating from a list
  // Prefer list cache over detail cache because list responses are more complete
  const getInitialData = (): Gallery | undefined => {
    if (!galleryId) return undefined;

    const listQueries = queryClient.getQueriesData({
      queryKey: queryKeys.galleries.lists(),
    });

    for (const [, data] of listQueries) {
      if (!data) continue;

      // Handle regular list queries (Gallery[])
      if (Array.isArray(data)) {
        const galleryFromList = (data as Gallery[]).find((g) => g.galleryId === galleryId);
        if (galleryFromList) {
          return galleryFromList;
        }
        continue;
      }

      // Handle infinite query structure ({ pages: [{ items: Gallery[], ... }] })
      if (data && typeof data === "object" && "pages" in data) {
        const pages = (data as { pages: Array<{ items?: Gallery[] }> }).pages;
        for (const page of pages) {
          if (page.items && Array.isArray(page.items)) {
            const galleryFromList = page.items.find((g: Gallery) => g.galleryId === galleryId);
            if (galleryFromList) {
              return galleryFromList;
            }
          }
        }
      }
    }

    // Fall back to detail cache if list cache doesn't have it
    // This is useful when navigating directly to a gallery without going through list first
    const detailCache = queryClient.getQueryData<Gallery>(queryKeys.galleries.detail(galleryId));

    // Only use detail cache if it has essential fields (avoid incomplete creation responses)
    if (detailCache?.galleryId) {
      // Check if this looks like a complete gallery object (has createdAt or other expected fields)
      // If it only has galleryId, paid, selectionEnabled, orderId - it's likely a creation response
      const hasEssentialFields =
        detailCache.createdAt !== undefined ||
        detailCache.galleryName !== undefined ||
        detailCache.pricingPackage !== undefined ||
        Object.keys(detailCache).length > 5; // More than just the basic creation response

      if (hasEssentialFields) {
        return detailCache;
      }
    }

    return undefined;
  };

  const initialData = getInitialData();

  return useQuery<Gallery>({
    queryKey: queryKeys.galleries.detail(galleryId ?? ""),
    queryFn: async () => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      const gallery = await api.galleries.get(galleryId);
      return gallery;
    },
    enabled: !!galleryId,
    initialData,
    placeholderData: (previousData) => previousData,
    ...options,
  });
}

export function useGalleryImages(
  galleryId: string | undefined,
  type: "originals" | "finals" | "thumb" = "thumb",
  options?: Omit<UseQueryOptions<GalleryImage[]>, "queryKey" | "queryFn">
) {
  return useQuery<GalleryImage[]>({
    queryKey: queryKeys.galleries.images(galleryId ?? "", type),
    queryFn: async () => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      // Always request all image sizes (thumb, preview, bigthumb) regardless of type. Use pagination to avoid unbounded response.
      const response = await api.galleries.getImages(galleryId, "thumb,preview,bigthumb", {
        limit: 100,
      });
      return (response.images || []) as GalleryImage[];
    },
    enabled: !!galleryId,
    ...options,
  });
}

export function useGalleryCoverPhoto(galleryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.galleries.coverPhoto(galleryId ?? ""),
    queryFn: () => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return api.galleries.getCoverPhoto(galleryId);
    },
    enabled: !!galleryId,
  });
}

export function useGalleryDeliveredOrders(galleryId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.galleries.deliveredOrders(galleryId ?? ""),
    queryFn: () => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return api.galleries.checkDeliveredOrders(galleryId);
    },
    enabled: !!galleryId,
    select: (data) => {
      return Array.isArray(data) ? data : data.items || [];
    },
  });
}

interface CalculatePlanResponse {
  suggestedPlan: unknown;
  originalsLimitBytes: number;
  finalsLimitBytes: number;
  uploadedSizeBytes: number;
  selectionEnabled: boolean;
  usagePercentage?: number;
  isNearCapacity?: boolean;
  isAtCapacity?: boolean;
  exceedsLargestPlan?: boolean;
  nextTierPlan?: {
    planKey: string;
    name: string;
    priceCents: number;
    storageLimitBytes: number;
    storage: string;
  };
}

export function useCalculatePlan(
  galleryId: string | undefined,
  duration: string = "1m",
  options?: Omit<UseQueryOptions<CalculatePlanResponse>, "queryKey" | "queryFn">
) {
  // Manually construct queryKey to avoid type issues with undefined galleryId
  // The query is disabled when galleryId is undefined, so the key won't be used
  const queryKey = galleryId
    ? (["galleries", "detail", galleryId, "calculate-plan", duration] as const)
    : (["galleries", "detail", "", "calculate-plan", duration] as const);

  return useQuery<CalculatePlanResponse>({
    queryKey,
    queryFn: () => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return api.galleries.calculatePlan(galleryId, duration);
    },
    enabled: !!galleryId,
    ...options,
  });
}
