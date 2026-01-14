"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/react-query";
import { formatApiError } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useSelectionActions(galleryId: string | null, token: string | null) {
  const queryClient = useQueryClient();

  // Get token from sessionStorage as fallback
  const effectiveToken =
    token ||
    (typeof window !== "undefined" && galleryId
      ? sessionStorage.getItem(`gallery_token_${galleryId}`)
      : null);

  const approveSelection = useMutation({
    mutationFn: async (selectedKeys: string[]) => {
      if (!galleryId || !effectiveToken) {
        throw new Error("Missing galleryId or token");
      }

      if (selectedKeys.length === 0) {
        throw new Error("At least one photo must be selected");
      }

      const response = await apiFetch(`${API_URL}/galleries/${galleryId}/selections/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
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
      }
    },
  });

  const requestChanges = useMutation({
    mutationFn: async () => {
      if (!galleryId || !effectiveToken) {
        throw new Error("Missing galleryId or token");
      }

      const response = await apiFetch(
        `${API_URL}/galleries/${galleryId}/selection-change-request`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
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
