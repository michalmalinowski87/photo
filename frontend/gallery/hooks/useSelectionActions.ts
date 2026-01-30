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

        // When unselecting, also remove the photo from album and print selections
        const nextPhotoBookKeys =
          !isSelected && Array.isArray(old.photoBookKeys)
            ? old.photoBookKeys.filter((k: string) => k !== key)
            : old.photoBookKeys ?? [];
        const nextPhotoPrintKeys =
          !isSelected && Array.isArray(old.photoPrintKeys)
            ? old.photoPrintKeys.filter((k: string) => k !== key)
            : old.photoPrintKeys ?? [];

        return {
          ...old,
          selectedKeys: newKeys,
          selectedCount: newKeys.length,
          photoBookKeys: nextPhotoBookKeys,
          photoPrintKeys: nextPhotoPrintKeys,
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

  const togglePhotoBook = useMutation({
    mutationFn: async ({ key, inSet }: { key: string; inSet: boolean }) => ({ key, inSet }),
    onMutate: async ({ key, inSet }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.gallery.selection(galleryId || "") });
      const previous = queryClient.getQueryData(queryKeys.gallery.selection(galleryId || ""));
      queryClient.setQueryData(queryKeys.gallery.selection(galleryId || ""), (old: any) => {
        if (!old) return old;
        const sel = old.selectedKeys || [];
        if (!sel.includes(key)) return old;
        const arr = Array.isArray(old.photoBookKeys) ? [...old.photoBookKeys] : [];
        const next = inSet
          ? arr.includes(key) ? arr : [...arr.filter((k: string) => k !== key), key]
          : arr.filter((k: string) => k !== key);
        const cap = Math.max(0, old.pricingPackage?.photoBookCount ?? 0);
        const clipped = next.length <= cap ? next : next.slice(0, cap);
        return { ...old, photoBookKeys: clipped };
      });
      return { previous };
    },
    onError: (_, __, ctx) => {
      if (ctx?.previous && galleryId) {
        queryClient.setQueryData(queryKeys.gallery.selection(galleryId), ctx.previous);
      }
    },
  });

  const togglePhotoPrint = useMutation({
    mutationFn: async ({ key, inSet }: { key: string; inSet: boolean }) => ({ key, inSet }),
    onMutate: async ({ key, inSet }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.gallery.selection(galleryId || "") });
      const previous = queryClient.getQueryData(queryKeys.gallery.selection(galleryId || ""));
      queryClient.setQueryData(queryKeys.gallery.selection(galleryId || ""), (old: any) => {
        if (!old) return old;
        const sel = old.selectedKeys || [];
        if (!sel.includes(key)) return old;
        const arr = Array.isArray(old.photoPrintKeys) ? [...old.photoPrintKeys] : [];
        const next = inSet
          ? arr.includes(key) ? arr : [...arr.filter((k: string) => k !== key), key]
          : arr.filter((k: string) => k !== key);
        const cap = Math.max(0, old.pricingPackage?.photoPrintCount ?? 0);
        const clipped = next.length <= cap ? next : next.slice(0, cap);
        return { ...old, photoPrintKeys: clipped };
      });
      return { previous };
    },
    onError: (_, __, ctx) => {
      if (ctx?.previous && galleryId) {
        queryClient.setQueryData(queryKeys.gallery.selection(galleryId), ctx.previous);
      }
    },
  });

  const approveSelection = useMutation({
    mutationFn: async (payload: { selectedKeys: string[]; photoBookKeys?: string[]; photoPrintKeys?: string[] }) => {
      if (!galleryId) {
        throw new Error("Missing galleryId");
      }

      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      const { selectedKeys, photoBookKeys, photoPrintKeys } = payload;
      const selectionState = queryClient.getQueryData(queryKeys.gallery.selection(galleryId)) as any;
      const isCancelingChangeRequest = selectionState?.changeRequestPending === true;

      if (selectedKeys.length === 0 && !isCancelingChangeRequest) {
        throw new Error("At least one photo must be selected");
      }

      const body: { selectedKeys: string[]; photoBookKeys?: string[]; photoPrintKeys?: string[] } = {
        selectedKeys,
      };
      if (Array.isArray(photoBookKeys)) body.photoBookKeys = photoBookKeys;
      if (Array.isArray(photoPrintKeys)) body.photoPrintKeys = photoPrintKeys;

      const response = await apiFetch(`${API_URL}/galleries/${galleryId}/selections/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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
    togglePhotoBook: {
      mutate: togglePhotoBook.mutate,
      mutateAsync: togglePhotoBook.mutateAsync,
      isLoading: togglePhotoBook.isPending,
      error: togglePhotoBook.error ? formatApiError(togglePhotoBook.error) : null,
      isSuccess: togglePhotoBook.isSuccess,
    },
    togglePhotoPrint: {
      mutate: togglePhotoPrint.mutate,
      mutateAsync: togglePhotoPrint.mutateAsync,
      isLoading: togglePhotoPrint.isPending,
      error: togglePhotoPrint.error ? formatApiError(togglePhotoPrint.error) : null,
      isSuccess: togglePhotoPrint.isSuccess,
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
