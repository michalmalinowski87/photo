"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/react-query";
import { getToken } from "@/lib/token";
import type { SelectionState } from "@/types/gallery";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useSelection(galleryId: string | null) {
  return useQuery({
    queryKey: queryKeys.gallery.selection(galleryId || ""),
    queryFn: async () => {
      if (!galleryId) {
        throw new Error("Missing galleryId");
      }

      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      const response = await apiFetch(`${API_URL}/galleries/${galleryId}/selections`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Parse response.data if it's a string (JSON string) - apiFetch should parse it, but handle both cases
      let selectionState: SelectionState;
      if (typeof response.data === 'string') {
        try {
          selectionState = JSON.parse(response.data) as SelectionState;
        } catch (e) {
          throw new Error('Failed to parse selection state response');
        }
      } else {
        selectionState = response.data as SelectionState;
      }
      
      return selectionState;
    },
    enabled: !!galleryId && !!getToken(galleryId),
    staleTime: 30 * 1000, // 30 seconds - selection state can change frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors
      if (error?.status === 401 || error?.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
