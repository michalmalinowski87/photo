import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

interface BytesUsedData {
  originalsBytesUsed: number;
  finalsBytesUsed: number;
}

interface UpdateBytesUsedVariables {
  galleryId: string;
  originalsSize: number;
  finalsSize: number;
}

/**
 * Mutation hook for optimistically updating bytesUsed after uploads
 * 
 * Features:
 * - Race-condition safe (cancels outgoing queries)
 * - Rollback on error
 * - Automatic reconciliation with backend
 * - Handles both originals and finals
 */
export function useUpdateBytesUsed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ galleryId }: { galleryId: string }) => {
      // This mutation doesn't actually call an API - it's purely for optimistic updates
      // The backend S3 events will update bytesUsed automatically
      // We just need to invalidate to get the real value after a delay
      return { galleryId };
    },
    onMutate: async ({ galleryId, originalsSize, finalsSize }: UpdateBytesUsedVariables) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.bytesUsed(galleryId),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });

      // Snapshot previous values for rollback
      const previousBytesUsed = queryClient.getQueryData<BytesUsedData>(
        queryKeys.galleries.bytesUsed(galleryId)
      );

      // Optimistically update bytesUsed
      queryClient.setQueryData<BytesUsedData>(
        queryKeys.galleries.bytesUsed(galleryId),
        (old) => {
          const current = old || { originalsBytesUsed: 0, finalsBytesUsed: 0 };
          return {
            originalsBytesUsed: Math.max(0, current.originalsBytesUsed + originalsSize),
            finalsBytesUsed: Math.max(0, current.finalsBytesUsed + finalsSize),
          };
        }
      );

      // Also update bytesUsed in gallery detail if it exists
      queryClient.setQueryData<any>(queryKeys.galleries.detail(galleryId), (old) => {
        if (!old) return old;
        const currentOriginals = old.originalsBytesUsed || 0;
        const currentFinals = old.finalsBytesUsed || 0;
        return {
          ...old,
          originalsBytesUsed: Math.max(0, currentOriginals + originalsSize),
          finalsBytesUsed: Math.max(0, currentFinals + finalsSize),
          bytesUsed: Math.max(0, (old.bytesUsed || 0) + originalsSize + finalsSize),
        };
      });

      return { previousBytesUsed };
    },
    onError: (_err, variables, context) => {
      // Rollback on error - restore previous values
      if (context?.previousBytesUsed) {
        queryClient.setQueryData(
          queryKeys.galleries.bytesUsed(variables.galleryId),
          context.previousBytesUsed
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      // After a short delay, invalidate to get real value from backend
      // This allows S3 events to process (typically 100-500ms)
      // We use a longer delay to ensure backend has processed
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.bytesUsed(variables.galleryId),
        });
        // Also invalidate gallery detail to sync bytesUsed there
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.detail(variables.galleryId),
        });
      }, 2000); // 2 seconds - enough time for S3 events to process
    },
  });
}

/**
 * Mutation hook for optimistically updating bytesUsed after deletions
 * 
 * Similar to useUpdateBytesUsed but subtracts instead of adds
 */
export function useDecreaseBytesUsed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ galleryId }: { galleryId: string }) => {
      // This mutation doesn't actually call an API - it's purely for optimistic updates
      // The backend delete handler will update bytesUsed automatically
      return { galleryId };
    },
    onMutate: async ({ galleryId, originalsSize, finalsSize }: UpdateBytesUsedVariables) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.bytesUsed(galleryId),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });

      // Snapshot previous values for rollback
      const previousBytesUsed = queryClient.getQueryData<BytesUsedData>(
        queryKeys.galleries.bytesUsed(galleryId)
      );

      // Optimistically decrease bytesUsed
      queryClient.setQueryData<BytesUsedData>(
        queryKeys.galleries.bytesUsed(galleryId),
        (old) => {
          const current = old || { originalsBytesUsed: 0, finalsBytesUsed: 0 };
          return {
            originalsBytesUsed: Math.max(0, current.originalsBytesUsed - originalsSize),
            finalsBytesUsed: Math.max(0, current.finalsBytesUsed - finalsSize),
          };
        }
      );

      // Also update bytesUsed in gallery detail if it exists
      queryClient.setQueryData<any>(queryKeys.galleries.detail(galleryId), (old) => {
        if (!old) return old;
        const currentOriginals = old.originalsBytesUsed || 0;
        const currentFinals = old.finalsBytesUsed || 0;
        const totalDecrease = originalsSize + finalsSize;
        return {
          ...old,
          originalsBytesUsed: Math.max(0, currentOriginals - originalsSize),
          finalsBytesUsed: Math.max(0, currentFinals - finalsSize),
          bytesUsed: Math.max(0, (old.bytesUsed || 0) - totalDecrease),
        };
      });

      return { previousBytesUsed };
    },
    onError: (_err, variables, context) => {
      // Rollback on error - restore previous values
      if (context?.previousBytesUsed) {
        queryClient.setQueryData(
          queryKeys.galleries.bytesUsed(variables.galleryId),
          context.previousBytesUsed
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      // After a short delay, invalidate to get real value from backend
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.bytesUsed(variables.galleryId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.detail(variables.galleryId),
        });
      }, 2000); // 2 seconds - enough time for backend to process deletions
    },
  });
}

