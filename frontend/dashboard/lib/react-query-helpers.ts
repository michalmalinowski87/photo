import { QueryClient } from "@tanstack/react-query";

import type { GalleryImage } from "../types";

import api from "./api-service";

interface GetImagesResponse {
  images: GalleryImage[];
  hasMore?: boolean;
  nextCursor?: string | null;
  totalCount?: number;
  stats?: {
    totalCount?: number;
    orderCounts?: Array<{ orderId: string; count: number }>;
    unselectedCount?: number;
  };
}

interface InfiniteQueryPage {
  images: GalleryImage[];
  hasMore?: boolean;
  nextCursor?: string | null;
  totalCount?: number;
  stats?: {
    totalCount?: number;
    orderCounts?: Array<{ orderId: string; count: number }>;
    unselectedCount?: number;
  };
}

interface InfiniteQueryData {
  pages: InfiniteQueryPage[];
  pageParams?: (string | null)[];
}

/**
 * Refetches only the first page of infinite queries matching the predicate.
 * This is more efficient than invalidating all pages, which would refetch everything.
 *
 * @param queryClient - React Query client instance
 * @param predicate - Function to match queries that should be refetched
 */
export async function refetchFirstPageOnly(
  queryClient: QueryClient,
  predicate: (query: { queryKey: readonly unknown[] }) => boolean
): Promise<void> {
  // Find all matching infinite queries
  const matchingQueries = queryClient
    .getQueryCache()
    .findAll({ predicate })
    .filter((query) => {
      // Only process infinite queries (they have pages structure)
      const data = query.state.data;
      return data && typeof data === "object" && "pages" in data;
    });

  // Refetch first page for each matching query
  const refetchPromises = matchingQueries.map(async (query) => {
    try {
      const queryKey = query.queryKey as unknown[];

      // Extract parameters from query key
      // Query key structure: ["galleries", "detail", galleryId, "images", "infinite", type, limit, filterOrderId, filterUnselected]
      if (
        !Array.isArray(queryKey) ||
        queryKey.length < 6 ||
        queryKey[0] !== "galleries" ||
        queryKey[1] !== "detail" ||
        queryKey[3] !== "images" ||
        queryKey[4] !== "infinite"
      ) {
        // Skip if query key doesn't match expected structure
        return;
      }

      const galleryId = queryKey[2] as string;
      const type = (queryKey[5] as "originals" | "finals" | "thumb") || "thumb";
      const limit = (queryKey[6] as number) || 50;
      const filterOrderId = queryKey[7] as string | undefined;
      const filterUnselected = queryKey[8] as boolean | undefined;

      if (!galleryId || typeof galleryId !== "string") {
        return;
      }

      // Fetch first page directly from API (cursor = null)
      // Always request all image sizes (thumb, preview, bigthumb) regardless of type
      const response = await api.galleries.getImages(
        galleryId,
        "thumb,preview,bigthumb",
        {
          limit,
          cursor: null,
        },
        filterOrderId,
        filterUnselected
      );

      // Get current cache data first (needed for filtering logic)
      const currentData = query.state.data as InfiniteQueryData | undefined;

      // Handle backward compatibility - if response doesn't have pagination fields
      // Create new objects for stats to ensure React Query detects the change
      const typedResponse = response as GetImagesResponse;
      const responseStats = typedResponse.stats;
      const responseTotalCount = typedResponse.totalCount;

      let firstPage =
        response.images && !("hasMore" in response)
          ? {
              images: response.images,
              hasMore: false,
              nextCursor: null,
              totalCount: responseTotalCount,
              stats: responseStats ? { ...responseStats } : responseStats, // Create new object for stats
            }
          : {
              images: response.images || [],
              hasMore: response.hasMore,
              nextCursor: response.nextCursor,
              totalCount: responseTotalCount,
              stats: responseStats ? { ...responseStats } : responseStats, // Create new object for stats
            };

      // Filter out any images that were optimistically deleted from the current cache
      // This prevents deleted images from reappearing if backend hasn't fully processed deletion yet
      // IMPORTANT: Preserve stats and totalCount from backend response (they're accurate)
      if (currentData && Array.isArray(currentData.pages) && currentData.pages.length > 0) {
        const firstPageFromCache = currentData.pages[0];
        if (firstPageFromCache && Array.isArray(firstPageFromCache.images)) {
          // Get image keys that exist in cache but not in the refetched data
          // These are likely images that were optimistically deleted
          const cachedImageKeys = new Set(
            firstPageFromCache.images
              .map((img) => {
                const key = img.key ?? img.filename;
                return typeof key === "string" ? key : "";
              })
              .filter(Boolean)
          );
          const refetchedImageKeys = new Set(
            firstPage.images
              .map((img) => {
                const key = img.key ?? img.filename;
                return typeof key === "string" ? key : "";
              })
              .filter(Boolean)
          );

          // If cache has fewer images than refetched data, filter refetched data to match cache
          // This ensures deleted images don't reappear
          // But preserve stats and totalCount from backend (they're the source of truth)
          if (cachedImageKeys.size < refetchedImageKeys.size) {
            firstPage = {
              ...firstPage,
              images: firstPage.images.filter((img) => {
                const imgKey = img.key ?? img.filename;
                return typeof imgKey === "string" && imgKey && cachedImageKeys.has(imgKey);
              }),
              // Preserve stats and totalCount from backend response - don't overwrite with filtered count
              totalCount: firstPage.totalCount,
              stats: firstPage.stats,
            };
          }
        }
      }

      // Use setQueryData with a function updater to ensure React Query detects the change
      // This is critical for triggering re-renders in components using this query
      // The function form ensures React Query knows the data has changed
      queryClient.setQueryData(queryKey, (oldData: InfiniteQueryData | undefined) => {
        if (!oldData || !Array.isArray(oldData.pages)) {
          return {
            pages: [firstPage],
            pageParams: [null],
          };
        }

        // Create completely new object structure with new references at every level
        // This ensures React Query's change detection works correctly
        // Important: Create new objects for stats and all nested properties to bypass structural sharing
        const newPages = oldData.pages.map((page, index: number) => {
          if (index === 0) {
            // First page: use the refetched firstPage with new stats
            // Always create new object references to ensure React Query detects the change
            // This bypasses React Query's structural sharing optimization
            return {
              ...firstPage,
              // Ensure stats is always a new object reference (even if values are the same)
              stats:
                firstPage.stats && typeof firstPage.stats === "object"
                  ? { ...firstPage.stats }
                  : firstPage.stats,
            };
          }
          // Other pages: create new object reference
          return { ...page };
        });

        // Always return a new object structure to ensure React Query detects the change
        return {
          pages: newPages,
          pageParams: oldData.pageParams ? [null, ...oldData.pageParams.slice(1)] : [null],
        };
      });

      // Force React Query to notify subscribers by invalidating with refetchType: 'none'
      // This ensures components re-render even if structural sharing would prevent it
      // Also notify all queries that match the base key pattern to ensure stats queries are updated
      void queryClient.invalidateQueries({
        queryKey,
        refetchType: "none", // Don't refetch, just notify subscribers of the cache update
      });

      // Also notify queries with the same base key but different parameters (e.g., stats query with limit: 1)
      // This ensures the stats query subscribers are also notified
      const baseQueryKey = queryKey.slice(0, 3); // ["galleries", "detail", galleryId]
      void queryClient.invalidateQueries({
        predicate: (q) => {
          const qKey = q.queryKey as unknown[];
          return (
            Array.isArray(qKey) &&
            qKey.length >= 3 &&
            qKey[0] === baseQueryKey[0] &&
            qKey[1] === baseQueryKey[1] &&
            qKey[2] === baseQueryKey[2] &&
            qKey[3] === "images"
          );
        },
        refetchType: "none", // Don't refetch, just notify subscribers
      });
    } catch (error) {
      // Log error but don't fail the entire operation
      console.warn(
        "[refetchFirstPageOnly] Failed to refetch first page for query:",
        query.queryKey,
        error
      );
    }
  });

  // Wait for all refetches to complete
  await Promise.allSettled(refetchPromises);
}

/**
 * Resets infinite query data to initial state and refetches the first page.
 * This is simpler than optimistic updates - just reset everything and start fresh.
 *
 * @param queryClient - React Query client instance
 * @param predicate - Function to match queries that should be reset and refetched
 */
export async function resetInfiniteQueryAndRefetchFirstPage(
  queryClient: QueryClient,
  predicate: (query: { queryKey: readonly unknown[] }) => boolean
): Promise<void> {
  // Find all matching infinite queries
  const matchingQueries = queryClient
    .getQueryCache()
    .findAll({ predicate })
    .filter((query) => {
      // Only process infinite queries (they have pages structure)
      const data = query.state.data;
      return data && typeof data === "object" && "pages" in data;
    });

  // Reset and refetch each matching query
  const resetPromises = matchingQueries.map(async (query) => {
    try {
      const queryKey = query.queryKey;

      // Reset query data to initial empty state
      queryClient.setQueryData(queryKey, {
        pages: [],
        pageParams: [],
      });

      // Invalidate and refetch the query to ensure it fetches fresh data
      // Using invalidateQueries with refetchType: 'active' ensures active queries are refetched
      await queryClient.invalidateQueries({
        queryKey,
        refetchType: "active",
      });
    } catch (error) {
      // Log error but don't fail the entire operation
      console.warn(
        "[resetInfiniteQueryAndRefetchFirstPage] Failed to reset and refetch query:",
        query.queryKey,
        error
      );
    }
  });

  // Wait for all resets and refetches to complete
  await Promise.allSettled(resetPromises);
}
