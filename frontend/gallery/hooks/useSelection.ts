"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/react-query";
import type { SelectionState } from "@/types/gallery";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useSelection(galleryId: string | null, token: string | null) {
  // Get token from sessionStorage as fallback if token prop is null (handles race condition on refresh)
  const effectiveToken = useMemo(() => {
    if (token) return token;
    if (typeof window !== "undefined" && galleryId) {
      const storedToken = sessionStorage.getItem(`gallery_token_${galleryId}`);
      return storedToken || null;
    }
    return null;
  }, [token, galleryId]);

  return useQuery({
    queryKey: queryKeys.gallery.selection(galleryId || ""),
    queryFn: async () => {
      if (!galleryId || !effectiveToken) {
        throw new Error("Missing galleryId or token");
      }

      const response = await apiFetch(`${API_URL}/galleries/${galleryId}/selections`, {
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
        },
      });

      return response.data as SelectionState;
    },
    enabled: !!galleryId && !!effectiveToken,
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
