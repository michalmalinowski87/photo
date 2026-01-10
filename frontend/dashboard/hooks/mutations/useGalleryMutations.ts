import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import { refetchFirstPageOnly } from "../../lib/react-query-helpers";
import type { Gallery, GalleryImage } from "../../types";
import { useOrderStatusPolling } from "../queries/useOrderStatusPolling";

interface InfiniteGalleryPage {
  items: Gallery[];
  hasMore?: boolean;
  nextCursor?: string | null;
}

interface InfiniteGalleryData {
  pages: InfiniteGalleryPage[];
  pageParams?: (string | null)[];
}

interface InfiniteImagePage {
  images: GalleryImage[];
  hasMore?: boolean;
  nextCursor?: string | null;
  totalCount?: number;
  stats?: {
    totalCount?: number;
    selectedCount?: number;
    unselectedCount?: number;
  };
}

interface InfiniteImageData {
  pages: InfiniteImagePage[];
  pageParams?: (string | null)[];
  stats?: {
    totalCount?: number;
    selectedCount?: number;
    unselectedCount?: number;
  };
}

export function useCreateGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Gallery>) => api.galleries.create(data),
    onSuccess: (data) => {
      if (data?.galleryId) {
        // Set cache with response data for immediate display
        queryClient.setQueryData(queryKeys.galleries.detail(data.galleryId), data);
        // Refetch gallery detail to ensure we have complete data from server
        // This is important because the creation response might not include all fields
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.detail(data.galleryId),
        });

        // Invalidate orders query for this gallery to ensure components see the newly created order
        // This is critical for non-selective galleries where an order is created immediately
        void queryClient.invalidateQueries({
          queryKey: queryKeys.orders.list(data.galleryId),
        });
      }
      // Remove ALL gallery infinite list queries from cache (active and inactive)
      // This ensures new gallery appears in all filter views (robocze, wyslano, etc.)
      // Removing queries forces fresh fetch when components mount, bypassing refetchOnMount: false
      void queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 3 &&
            key[0] === "galleries" &&
            key[1] === "list" &&
            key[2] === "infinite"
          );
        },
      });

      // Also invalidate to ensure any remaining queries are marked as stale
      // This handles edge cases where queries might not match the predicate exactly
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.lists(),
        refetchType: 'active', // Refetch active queries immediately
      });
    },
  });
}

export function useUpdateGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, data }: { galleryId: string; data: Partial<Gallery> }) =>
      api.galleries.update(galleryId, data),
    onMutate: async ({ galleryId, data }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.lists(),
      });

      // Snapshot previous values
      const previousGallery = queryClient.getQueryData<Gallery>(
        queryKeys.galleries.detail(galleryId)
      );
      const previousGalleryList = queryClient.getQueryData<Gallery[]>(queryKeys.galleries.lists());

      // Optimistically update gallery detail
      queryClient.setQueryData<Gallery>(queryKeys.galleries.detail(galleryId), (old) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          ...data,
        };
      });

      // Optimistically update gallery in list if it exists
      // Use setQueriesData to handle both regular and infinite queries
      queryClient.setQueriesData(
        {
          predicate: (query) => {
            return (
              Array.isArray(query.queryKey) &&
              query.queryKey.length >= 2 &&
              query.queryKey[0] === "galleries" &&
              query.queryKey[1] === "list"
            );
          },
        },
        (old) => {
          if (!old) {
            return old;
          }

          // Handle infinite query structure (has pages array)
          if (
            old &&
            typeof old === "object" &&
            "pages" in old &&
            Array.isArray((old as InfiniteGalleryData).pages)
          ) {
            const infiniteData = old as InfiniteGalleryData;
            return {
              ...infiniteData,
              pages: infiniteData.pages.map((page) => ({
                ...page,
                items:
                  page.items?.map((gallery: Gallery) =>
                    gallery.galleryId === galleryId ? { ...gallery, ...data } : gallery
                  ) ?? [],
              })),
            };
          }

          // Handle regular array structure
          if (Array.isArray(old)) {
            return old.map((gallery) =>
              gallery.galleryId === galleryId ? { ...gallery, ...data } : gallery
            );
          }

          return old;
        }
      );

      return { previousGallery, previousGalleryList };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousGallery) {
        queryClient.setQueryData(
          queryKeys.galleries.detail(variables.galleryId),
          context.previousGallery
        );
      }
      if (context?.previousGalleryList) {
        queryClient.setQueryData(queryKeys.galleries.lists(), context.previousGalleryList);
      }
    },
    onSuccess: (data, variables) => {
      // Update cache with response data if available (more accurate than optimistic update)
      if (data) {
        queryClient.setQueryData(queryKeys.galleries.detail(variables.galleryId), data);
      }

      // If coverPhotoUrl was updated, also invalidate the cover photo query
      if (variables.data.coverPhotoUrl !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.coverPhoto(variables.galleryId),
        });
      }
    },
    onSettled: (_, __, variables) => {
      // Refetch to ensure consistency
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });

      // If coverPhotoUrl was updated, also invalidate the cover photo query
      if (variables.data.coverPhotoUrl !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.coverPhoto(variables.galleryId),
        });
      }
    },
  });
}

/**
 * Optimistic-only mutation for updating gallery name.
 * Does not invalidate queries to avoid unnecessary refetches.
 * Only updates the gallery name in cache - no other data depends on it.
 */
export function useUpdateGalleryName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ galleryId, galleryName }: { galleryId: string; galleryName: string }) =>
      api.galleries.update(galleryId, { galleryName }),
    onMutate: async ({ galleryId, galleryName }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });
      await queryClient.cancelQueries({
        predicate: (query) => {
          // Cancel all list queries (with or without filters)
          return (
            Array.isArray(query.queryKey) &&
            query.queryKey.length >= 2 &&
            query.queryKey[0] === "galleries" &&
            query.queryKey[1] === "list"
          );
        },
      });

      // Snapshot previous values for rollback
      const previousGallery = queryClient.getQueryData<Gallery>(
        queryKeys.galleries.detail(galleryId)
      );

      // Get all list query caches for rollback
      const previousListQueries = new Map<string, Gallery[]>();
      queryClient
        .getQueriesData<Gallery[]>({
          predicate: (query) => {
            return (
              Array.isArray(query.queryKey) &&
              query.queryKey.length >= 2 &&
              query.queryKey[0] === "galleries" &&
              query.queryKey[1] === "list"
            );
          },
        })
        .forEach(([queryKey, data]) => {
          if (data) {
            const key = JSON.stringify(queryKey);
            previousListQueries.set(key, data);
          }
        });

      // Optimistically update gallery detail
      queryClient.setQueryData<Gallery>(queryKeys.galleries.detail(galleryId), (old) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          galleryName,
        };
      });

      // Optimistically update gallery in ALL list queries (regardless of filter)
      queryClient.setQueriesData(
        {
          predicate: (query) => {
            return (
              Array.isArray(query.queryKey) &&
              query.queryKey.length >= 2 &&
              query.queryKey[0] === "galleries" &&
              query.queryKey[1] === "list"
            );
          },
        },
        (old) => {
          if (!old) {
            return old;
          }

          // Handle infinite query structure (has pages array)
          if (
            old &&
            typeof old === "object" &&
            "pages" in old &&
            Array.isArray((old as InfiniteGalleryData).pages)
          ) {
            const infiniteData = old as InfiniteGalleryData;
            return {
              ...infiniteData,
              pages: infiniteData.pages.map((page) => ({
                ...page,
                items:
                  page.items?.map((gallery: Gallery) =>
                    gallery.galleryId === galleryId ? { ...gallery, galleryName } : gallery
                  ) ?? [],
              })),
            };
          }

          // Handle regular array structure
          if (Array.isArray(old)) {
            return old.map((gallery) =>
              gallery.galleryId === galleryId ? { ...gallery, galleryName } : gallery
            );
          }

          return old;
        }
      );

      return { previousGallery, previousListQueries };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousGallery) {
        queryClient.setQueryData(
          queryKeys.galleries.detail(variables.galleryId),
          context.previousGallery
        );
      }
      if (context?.previousListQueries) {
        context.previousListQueries.forEach((data, key) => {
          try {
            const queryKey = JSON.parse(key) as unknown[];
            queryClient.setQueryData(queryKey, data);
          } catch {
            // Ignore JSON parse errors
          }
        });
      }
    },
    onSuccess: (data, variables) => {
      // Update cache with response data (more accurate than optimistic update)
      // No query invalidation - we trust the optimistic update and server response
      if (data) {
        queryClient.setQueryData(queryKeys.galleries.detail(variables.galleryId), data);

        // Also update in ALL list caches (regardless of filter)
        queryClient.setQueriesData(
          {
            predicate: (query) => {
              return (
                Array.isArray(query.queryKey) &&
                query.queryKey.length >= 2 &&
                query.queryKey[0] === "galleries" &&
                query.queryKey[1] === "list"
              );
            },
          },
          (old) => {
            if (!old) {
              return old;
            }

            // Handle infinite query structure (has pages array)
            if (
              old &&
              typeof old === "object" &&
              "pages" in old &&
              Array.isArray((old as InfiniteGalleryData).pages)
            ) {
              const infiniteData = old as InfiniteGalleryData;
              return {
                ...infiniteData,
                pages: infiniteData.pages.map((page) => ({
                  ...page,
                  items:
                    page.items?.map((gallery: Gallery) =>
                      gallery.galleryId === variables.galleryId
                        ? { ...gallery, galleryName: variables.galleryName }
                        : gallery
                    ) ?? [],
                })),
              };
            }

            // Handle regular array structure
            if (Array.isArray(old)) {
              return old.map((gallery) =>
                gallery.galleryId === variables.galleryId
                  ? { ...gallery, galleryName: variables.galleryName }
                  : gallery
              );
            }

            return old;
          }
        );
      }
    },
    // No onSettled - we don't invalidate queries to avoid refetches
  });
}

export function useDeleteGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (galleryId: string) => api.galleries.delete(galleryId),
    onMutate: async (galleryId) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        predicate: (query) => {
          return (
            Array.isArray(query.queryKey) &&
            query.queryKey.length >= 2 &&
            query.queryKey[0] === "galleries" &&
            (query.queryKey[1] === "list" || query.queryKey[1] === "detail")
          );
        },
      });

      // Snapshot previous list queries for rollback
      const previousListQueries = new Map<string, Gallery[] | InfiniteGalleryData>();
      queryClient
        .getQueriesData({
          predicate: (query) => {
            return (
              Array.isArray(query.queryKey) &&
              query.queryKey.length >= 2 &&
              query.queryKey[0] === "galleries" &&
              query.queryKey[1] === "list"
            );
          },
        })
        .forEach(([queryKey, data]) => {
          if (data && (Array.isArray(data) || (typeof data === "object" && "pages" in data))) {
            const key = JSON.stringify(queryKey);
            previousListQueries.set(key, data as Gallery[] | InfiniteGalleryData);
          }
        });

      // Optimistically remove gallery from ALL list queries (infinite and regular)
      queryClient.setQueriesData(
        {
          predicate: (query) => {
            return (
              Array.isArray(query.queryKey) &&
              query.queryKey.length >= 2 &&
              query.queryKey[0] === "galleries" &&
              query.queryKey[1] === "list"
            );
          },
        },
        (old) => {
          if (!old) {
            return old;
          }

          // Handle infinite query structure (has pages array)
          if (
            old &&
            typeof old === "object" &&
            "pages" in old &&
            Array.isArray((old as InfiniteGalleryData).pages)
          ) {
            const infiniteData = old as InfiniteGalleryData;
            return {
              ...infiniteData,
              pages: infiniteData.pages.map((page) => ({
                ...page,
                items:
                  page.items?.filter((gallery: Gallery) => gallery.galleryId !== galleryId) ?? [],
              })),
            };
          }

          // Handle regular array structure
          if (Array.isArray(old)) {
            return old.filter((gallery) => gallery.galleryId !== galleryId);
          }

          return old;
        }
      );

      // Remove gallery detail query
      queryClient.removeQueries({ queryKey: queryKeys.galleries.detail(galleryId) });

      return { previousListQueries };
    },
    onError: (_err, _galleryId, context) => {
      // Rollback on error
      if (context?.previousListQueries) {
        context.previousListQueries.forEach((data, key) => {
          try {
            const queryKey = JSON.parse(key) as unknown[];
            queryClient.setQueryData(queryKey, data);
          } catch {
            // Ignore JSON parse errors
          }
        });
      }
    },
    onSuccess: (_, galleryId) => {
      // Remove gallery detail query
      queryClient.removeQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
      // No need to invalidate - optimistic update already removed the gallery
      // Only invalidate if we want to ensure backend consistency (optional)
    },
  });
}

// Track in-flight mutations per galleryId to prevent concurrent calls
// Map galleryId to the promise so we can return the same promise for concurrent calls
const sendingGalleryPromises = new Map<string, Promise<{ isReminder?: boolean }>>();

export function useSendGalleryToClient() {
  const queryClient = useQueryClient();
  const { resetTimer } = useOrderStatusPolling();

  return useMutation({
    mutationFn: async (galleryId: string) => {
      // Atomic check-and-set: check if promise exists, if not create and store synchronously
      let promise = sendingGalleryPromises.get(galleryId);

      if (!promise) {
        // Create promise synchronously and store it immediately (before any await)
        // This ensures that concurrent calls will see the stored promise
        promise = (async () => {
          try {
            return await api.galleries.sendToClient(galleryId);
          } finally {
            // Always remove from map after completion (success or error)
            sendingGalleryPromises.delete(galleryId);
          }
        })();

        // Store the promise immediately (synchronously) before any async operations
        sendingGalleryPromises.set(galleryId, promise);
      }

      // Return the promise (either existing or newly created)
      return promise;
    },
    // Don't retry on 429 (Too Many Requests) - rate limiting errors should not be retried
    retry: (failureCount, error) => {
      // Check if error is a 429 status code
      const errorWithStatus = error as { status?: number };
      if (errorWithStatus?.status === 429) {
        return false; // Don't retry 429 errors
      }
      // For other errors, use default retry behavior (1 retry)
      return failureCount < 1;
    },
    onSuccess: (_, galleryId) => {
      // Reset polling timer after successful mutation (sending gallery can create orders or change status)
      resetTimer();
      void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.byGallery(galleryId) });
    },
  });
}

export function usePayGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      galleryId: string;
      options?: {
        dryRun?: boolean;
        plan?: string;
        priceCents?: number;
        redirectUrl?: string;
      };
    }) => api.galleries.pay(params.galleryId, params.options ?? {}),
    onSuccess: (_, variables) => {
      // Invalidate gallery detail (payment status changes) and wallet balance
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    },
  });
}

export function useUpdateGalleryClientPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      password,
      clientEmail,
    }: {
      galleryId: string;
      password: string;
      clientEmail: string;
    }) => api.galleries.updateClientPassword(galleryId, password, clientEmail),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
    },
  });
}

export function useUpdateGalleryPricingPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      pricingPackage,
    }: {
      galleryId: string;
      pricingPackage: {
        packageName?: string;
        includedCount: number;
        extraPriceCents: number;
        packagePriceCents: number;
      };
    }) => api.galleries.updatePricingPackage(galleryId, pricingPackage),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}

export function useUpgradeGalleryPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      data,
    }: {
      galleryId: string;
      data: { plan: string; redirectUrl?: string };
    }) => api.galleries.upgradePlan(galleryId, data),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    },
  });
}

/**
 * Delete gallery images (handles both single and batch operations)
 * For single deletion, pass an array with one image key: [imageKey]
 */
export function useDeleteGalleryImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      galleryId,
      imageKeys,
    }: {
      galleryId: string;
      imageKeys: string[];
      imageType?: "originals" | "finals" | "thumb";
    }) => api.galleries.deleteImage(galleryId, imageKeys),
    onMutate: async ({ galleryId, imageKeys, imageType = "originals" }) => {
      // Cancel outgoing queries to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.images(galleryId, imageType),
      });

      // Cancel infinite image queries
      await queryClient.cancelQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 5 &&
            key[0] === "galleries" &&
            key[1] === "detail" &&
            key[2] === galleryId &&
            key[3] === "images" &&
            key[4] === "infinite"
          );
        },
      });

      // Also cancel thumb queries and gallery detail if deleting originals
      if (imageType === "originals") {
        await queryClient.cancelQueries({
          queryKey: queryKeys.galleries.images(galleryId, "thumb"),
        });
      }

      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });

      // Snapshot previous state
      const previousImages = queryClient.getQueryData<GalleryImage[]>(
        queryKeys.galleries.images(galleryId, imageType)
      );
      const previousThumbImages =
        imageType === "originals"
          ? queryClient.getQueryData<GalleryImage[]>(queryKeys.galleries.images(galleryId, "thumb"))
          : null;
      const previousGallery = queryClient.getQueryData<Gallery>(
        queryKeys.galleries.detail(galleryId)
      );

      // Snapshot infinite query states for rollback on error
      const previousInfiniteQueries = queryClient
        .getQueryCache()
        .findAll({
          predicate: (query) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              key.length >= 6 &&
              key[0] === "galleries" &&
              key[1] === "detail" &&
              key[2] === galleryId &&
              key[3] === "images" &&
              key[4] === "infinite" &&
              key[5] === imageType
            );
          },
        })
        .map((query) => ({
          queryKey: query.queryKey,
          data: query.state.data,
        }));

      // Calculate total file size from images being deleted for optimistic storage update
      // Only for originals and finals (not thumbs)
      let totalBytesToSubtract = 0;
      if ((imageType === "originals" || imageType === "finals") && previousImages) {
        const imagesToDelete = previousImages.filter((img) =>
          imageKeys.includes(img.key ?? img.filename ?? "")
        );
        totalBytesToSubtract = imagesToDelete.reduce((sum, img) => sum + (img.size ?? 0), 0);
      }

      // Optimistically remove images from regular cache
      queryClient.setQueryData<GalleryImage[]>(
        queryKeys.galleries.images(galleryId, imageType),
        (old = []) => old.filter((img) => !imageKeys.includes(img.key ?? img.filename ?? ""))
      );

      // Also update thumb cache if deleting originals
      if (imageType === "originals") {
        queryClient.setQueryData<GalleryImage[]>(
          queryKeys.galleries.images(galleryId, "thumb"),
          (old = []) => old.filter((img) => !imageKeys.includes(img.key ?? img.filename ?? ""))
        );
      }

      // Optimistically remove images from ALL infinite query caches for this gallery and image type
      // This handles infinite queries with different limits, filters, etc.
      // When deleting originals, also update thumb queries since thumb images are derived from originals
      const typesToUpdate = imageType === "originals" ? [imageType, "thumb"] : [imageType];

      typesToUpdate.forEach((typeToUpdate) => {
        queryClient.setQueriesData(
          {
            predicate: (query) => {
              const key = query.queryKey;
              // Match infinite image queries: ["galleries", "detail", galleryId, "images", "infinite", type, ...]
              return (
                Array.isArray(key) &&
                key.length >= 6 &&
                key[0] === "galleries" &&
                key[1] === "detail" &&
                key[2] === galleryId &&
                key[3] === "images" &&
                key[4] === "infinite" &&
                key[5] === typeToUpdate
              );
            },
          },
          (old) => {
            if (!old) {
              return old;
            }

            // Handle infinite query structure: { pages: [{ images: GalleryImage[], hasMore, nextCursor }, ...] }
            if (
              old &&
              typeof old === "object" &&
              "pages" in old &&
              Array.isArray((old as InfiniteImageData).pages)
            ) {
              // Calculate total deleted count across all pages for stats update
              let totalDeletedFromQuery = 0;
              const infiniteData = old as InfiniteImageData;
              const updatedPages = infiniteData.pages.map((page) => {
                if (!Array.isArray(page.images)) {
                  return page;
                }
                const imagesBefore = page.images.length;
                const filteredImages = page.images.filter(
                  (img: GalleryImage) => !imageKeys.includes(img.key ?? img.filename ?? "")
                );
                const deletedFromPage = imagesBefore - filteredImages.length;
                totalDeletedFromQuery += deletedFromPage;

                return {
                  ...page,
                  images: filteredImages,
                };
              });

              // Update stats in the first page if it exists
              const firstPage = updatedPages[0];
              if (firstPage && typeof firstPage.totalCount === "number") {
                firstPage.totalCount = Math.max(0, firstPage.totalCount - totalDeletedFromQuery);
              }
              // Update stats in the overall query if it exists at the root level
              if (infiniteData.stats && typeof infiniteData.stats.totalCount === "number") {
                return {
                  ...infiniteData,
                  pages: updatedPages,
                  stats: {
                    ...infiniteData.stats,
                    totalCount: Math.max(0, infiniteData.stats.totalCount - totalDeletedFromQuery),
                  },
                };
              }

              return {
                ...infiniteData,
                pages: updatedPages,
              };
            }

            return old;
          }
        );
      });

      // Optimistically update storage usage for immediate UI feedback
      if (totalBytesToSubtract > 0 && previousGallery) {
        queryClient.setQueryData<Gallery>(queryKeys.galleries.detail(galleryId), (old) => {
          if (!old) {
            return old;
          }
          const currentOriginals = old.originalsBytesUsed ?? 0;
          const currentFinals = old.finalsBytesUsed ?? 0;

          if (imageType === "originals") {
            return {
              ...old,
              originalsBytesUsed: Math.max(0, currentOriginals - totalBytesToSubtract),
            };
          } else if (imageType === "finals") {
            return {
              ...old,
              finalsBytesUsed: Math.max(0, currentFinals - totalBytesToSubtract),
            };
          }
          return old;
        });
      }

      return { previousImages, previousThumbImages, previousGallery, previousInfiniteQueries };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousImages) {
        queryClient.setQueryData(
          queryKeys.galleries.images(variables.galleryId, variables.imageType ?? "originals"),
          context.previousImages
        );
      }
      if (context?.previousThumbImages && variables.imageType === "originals") {
        queryClient.setQueryData(
          queryKeys.galleries.images(variables.galleryId, "thumb"),
          context.previousThumbImages
        );
      }
      if (context?.previousGallery) {
        queryClient.setQueryData(
          queryKeys.galleries.detail(variables.galleryId),
          context.previousGallery
        );
      }
      // Rollback infinite queries
      if (context?.previousInfiniteQueries) {
        context.previousInfiniteQueries.forEach(({ queryKey, data }) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSuccess: (data, variables) => {
      // Update gallery detail with API response if available (more accurate than optimistic update)
      // The backend returns updated storage values synchronously
      if (data && typeof data === "object" && "originalsBytesUsed" in data) {
        queryClient.setQueryData<Gallery>(
          queryKeys.galleries.detail(variables.galleryId),
          (old) => {
            if (!old) {
              return old;
            }
            return {
              ...old,
              originalsBytesUsed: data.originalsBytesUsed,
              originalsLimitBytes: data.originalsLimitBytes ?? old.originalsLimitBytes,
            };
          }
        );
      }

      // Invalidate image queries to ensure UI reflects backend state
      // Backend processes deletion synchronously, so we can invalidate immediately
      // Use Promise.resolve().then() to let React Query finish processing optimistic updates first
      void Promise.resolve().then(async () => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.images(
            variables.galleryId,
            variables.imageType ?? "originals"
          ),
        });

        // Refetch first page to update stats, but the helper function will filter out
        // any images that were optimistically deleted (preventing them from reappearing)
        // Use a delay to ensure backend has processed the deletion and stats are updated
        setTimeout(async () => {
          await refetchFirstPageOnly(queryClient, (query) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              key.length >= 6 &&
              key[0] === "galleries" &&
              key[1] === "detail" &&
              key[2] === variables.galleryId &&
              key[3] === "images" &&
              key[4] === "infinite" &&
              key[5] === (variables.imageType ?? "originals")
            );
          });
        }, 1000);

        // Also invalidate and refetch thumb queries if deleting originals
        // This includes the stats query (type: "thumb", limit: 1) which provides counters
        if (variables.imageType === "originals" || !variables.imageType) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.galleries.images(variables.galleryId, "thumb"),
          });
          setTimeout(async () => {
            // Refetch all thumb infinite queries, including the stats query
            await refetchFirstPageOnly(queryClient, (query) => {
              const key = query.queryKey;
              return (
                Array.isArray(key) &&
                key.length >= 6 &&
                key[0] === "galleries" &&
                key[1] === "detail" &&
                key[2] === variables.galleryId &&
                key[3] === "images" &&
                key[4] === "infinite" &&
                key[5] === "thumb"
              );
            });
          }, 1000);
        }
      });

      // Storage is already updated with API response data above, so no need to invalidate
      // The API response contains the accurate storage values from the synchronous backend
    },
  });
}

/**
 * Upload cover photo mutation
 * Handles the complete upload flow: presigned URL → S3 upload → gallery update → polling for CloudFront URL
 * Uses React Query mutation to manage the entire upload state
 */
export function useUploadCoverPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ galleryId, file }: { galleryId: string; file: File }) => {
      // Step 1: Get presigned URL
      const timestamp = Date.now();
      const fileExtension = file.name.split(".").pop() ?? "jpg";
      const key = `cover_${timestamp}.${fileExtension}`;

      const presignResponse = await api.uploads.getPresignedUrl({
        galleryId,
        key,
        contentType: file.type ?? "image/jpeg",
        fileSize: file.size,
      });

      // Step 2: Upload file to S3
      // Use fetch like the original working implementation
      await fetch(presignResponse.url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type ?? "image/jpeg",
        },
      });

      // Step 3: Update gallery with S3 URL (backend will convert to CloudFront)
      // Use the presigned URL without query params as the S3 URL
      const s3Url = presignResponse.url.split("?")[0]; // Remove query params
      await api.galleries.update(galleryId, { coverPhotoUrl: s3Url });

      // Step 4: Poll for CloudFront URL (with timeout)
      const maxAttempts = 30;
      const pollInterval = 1000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        try {
          const coverPhotoResponse = await api.galleries.getCoverPhoto(galleryId);
          const fetchedUrl = coverPhotoResponse.coverPhotoUrl;

          // Check if we have a CloudFront URL (not S3, not null)
          if (
            fetchedUrl &&
            typeof fetchedUrl === "string" &&
            !fetchedUrl.includes(".s3.") &&
            !fetchedUrl.includes("s3.amazonaws.com")
          ) {
            // Update gallery with CloudFront URL
            await api.galleries.update(galleryId, { coverPhotoUrl: fetchedUrl });
            return { success: true, coverPhotoUrl: fetchedUrl };
          }
        } catch {
          // Continue polling on error
        }
      }

      // Max attempts reached - return partial success
      return {
        success: true,
        coverPhotoUrl: s3Url,
        warning: "Processing taking longer than usual",
      };
    },
    onSuccess: (_data, variables) => {
      // Invalidate queries to refresh UI
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(variables.galleryId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.coverPhoto(variables.galleryId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}
