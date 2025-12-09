import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Gallery, GalleryImage } from "../../types";
import { useOrderStatusPolling } from "../queries/useOrderStatusPolling";

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
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
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
      if (previousGalleryList) {
        queryClient.setQueryData<Gallery[]>(queryKeys.galleries.lists(), (old) => {
          if (!old) {
            return old;
          }
          return old.map((gallery) =>
            gallery.galleryId === galleryId ? { ...gallery, ...data } : gallery
          );
        });
      }

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
      queryClient.setQueriesData<Gallery[]>(
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
          return old.map((gallery) =>
            gallery.galleryId === galleryId ? { ...gallery, galleryName } : gallery
          );
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
        queryClient.setQueriesData<Gallery[]>(
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
            return old.map((gallery) =>
              gallery.galleryId === variables.galleryId
                ? { ...gallery, galleryName: variables.galleryName }
                : gallery
            );
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
    onSuccess: (_, galleryId) => {
      queryClient.removeQueries({ queryKey: queryKeys.galleries.detail(galleryId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.galleries.lists() });
    },
  });
}

export function useSendGalleryToClient() {
  const queryClient = useQueryClient();
  const { resetTimer } = useOrderStatusPolling();

  return useMutation({
    mutationFn: (galleryId: string) => api.galleries.sendToClient(galleryId),
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

      // Calculate total file size from images being deleted for optimistic storage update
      // Only for originals and finals (not thumbs)
      let totalBytesToSubtract = 0;
      if ((imageType === "originals" || imageType === "finals") && previousImages) {
        const imagesToDelete = previousImages.filter((img) =>
          imageKeys.includes(img.key ?? img.filename ?? "")
        );
        totalBytesToSubtract = imagesToDelete.reduce((sum, img) => sum + (img.size ?? 0), 0);
      }

      // Optimistically remove images from cache
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

      return { previousImages, previousThumbImages, previousGallery };
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
      void Promise.resolve().then(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.images(
            variables.galleryId,
            variables.imageType ?? "originals"
          ),
        });

        // Also invalidate thumb queries if deleting originals
        if (variables.imageType === "originals" || !variables.imageType) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.galleries.images(variables.galleryId, "thumb"),
          });
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
        } catch (pollErr) {
          console.error("Failed to poll for cover photo URL:", pollErr);
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
