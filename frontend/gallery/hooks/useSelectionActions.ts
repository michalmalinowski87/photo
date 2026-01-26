"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/react-query";
import { getToken } from "@/lib/token";
import { getPublicApiUrl } from "@/lib/public-env";

const API_URL = getPublicApiUrl();

export function useSelectionActions(galleryId: string | null) {
  const queryClient = useQueryClient();

  // Toggle individual photo selection - optimistic update
  const toggleSelection = useMutation({
    mutationFn: async ({ key, isSelected }: { key: string; isSelected: boolean }) => {
      // This is a client-side only operation - we update React Query cache optimistically
      // The actual server update happens when approving the selection
      return { key, isSelected };
    },
    onMutate: async ({ key, isSelected }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.gallery.selection(galleryId || "") });

      // Snapshot previous value
      const previousState = queryClient.getQueryData(queryKeys.gallery.selection(galleryId || ""));

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.gallery.selection(galleryId || ""), (old: any) => {
        if (!old) {
          // If no state exists yet, create a minimal one (shouldn't happen but handle gracefully)
          return old;
        }
        
        const currentKeys = old.selectedKeys || [];
        const newKeys = isSelected
          ? [...currentKeys.filter((k: string) => k !== key), key] // Add if not already present
          : currentKeys.filter((k: string) => k !== key); // Remove

        return {
          ...old,
          selectedKeys: newKeys,
          selectedCount: newKeys.length,
        };
      });

      return { previousState };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousState && galleryId) {
        queryClient.setQueryData(queryKeys.gallery.selection(galleryId), context.previousState);
      }
    },
    // Don't invalidate on settled - optimistic update is sufficient for client-side toggles
    // Only invalidate when actually approving (which happens in approveSelection mutation)
  });

  const approveSelection = useMutation({
    mutationFn: async (selectedKeys: string[]) => {
      if (!galleryId) {
        throw new Error("Missing galleryId");
      }

      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      // Check if we're canceling a change request (backend will restore the order)
      // If changeRequestPending is true, allow empty selectedKeys - backend will use existing order's keys
      const selectionState = queryClient.getQueryData(queryKeys.gallery.selection(galleryId)) as any;
      const isCancelingChangeRequest = selectionState?.changeRequestPending === true;

      // Only validate selectedKeys if we're not canceling a change request
      if (selectedKeys.length === 0 && !isCancelingChangeRequest) {
        throw new Error("At least one photo must be selected");
      }

      const response = await apiFetch(`${API_URL}/galleries/${galleryId}/selections/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedKeys }),
      });

      return response.data;
    },
    onSuccess: () => {
      // Invalidate selection query to refetch updated state
      if (galleryId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.gallery.selection(galleryId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.gallery.status(galleryId) });
        // Refetch client-approved orders after approval
        queryClient.invalidateQueries({ queryKey: ["orders", "client-approved", galleryId] });
        // Refetch all image queries (including unselected) to refresh "Niewybrane" view
        // This invalidates both filterUnselected=true and filterUnselected=false queries
        queryClient.invalidateQueries({ 
          queryKey: [...queryKeys.gallery.detail(galleryId), "images", "infinite"] 
        });
      }
    },
  });

  const requestChanges = useMutation({
    mutationFn: async () => {
      if (!galleryId) {
        throw new Error("Missing galleryId");
      }

      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      const response = await apiFetch(
        `${API_URL}/galleries/${galleryId}/selection-change-request`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    },
    onSuccess: () => {
      // Invalidate selection query to refetch updated state
      if (galleryId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.gallery.selection(galleryId) });
      }
    },
  });

  return {
    toggleSelection: {
      mutate: toggleSelection.mutate,
      mutateAsync: toggleSelection.mutateAsync,
      isLoading: toggleSelection.isPending,
      error: toggleSelection.error ? formatApiError(toggleSelection.error) : null,
      isSuccess: toggleSelection.isSuccess,
    },
    approveSelection: {
      mutate: approveSelection.mutate,
      mutateAsync: approveSelection.mutateAsync,
      isLoading: approveSelection.isPending,
      error: approveSelection.error
        ? formatApiError(approveSelection.error)
        : null,
      isSuccess: approveSelection.isSuccess,
    },
    requestChanges: {
      mutate: requestChanges.mutate,
      mutateAsync: requestChanges.mutateAsync,
      isLoading: requestChanges.isPending,
      error: requestChanges.error ? formatApiError(requestChanges.error) : null,
      isSuccess: requestChanges.isSuccess,
    },
  };
}
