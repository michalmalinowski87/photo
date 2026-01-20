"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/token";
import { getPublicApiUrl } from "@/lib/public-env";

const API_URL = getPublicApiUrl();

interface ZipStatus {
  status: "ready" | "generating" | "not_started";
  generating: boolean;
  ready: boolean;
  zipExists: boolean;
  zipSize?: number;
  elapsedSeconds?: number;
  progress?: {
    processed: number;
    total: number;
    percent: number;
  };
}

export function useZipStatus(
  galleryId: string | null,
  orderId: string | null,
  enabled: boolean = true
) {
  return useQuery<ZipStatus>({
    queryKey: ["zipStatus", "final", galleryId, orderId],
    queryFn: async () => {
      if (!galleryId || !orderId) {
        throw new Error("Missing galleryId or orderId");
      }

      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      const response = await apiFetch(
        `${API_URL}/galleries/${galleryId}/orders/${orderId}/final/zip/status`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data as ZipStatus;
    },
    enabled: enabled && !!galleryId && !!orderId && !!getToken(galleryId),
    refetchInterval: (query) => {
      const data = query.state.data as ZipStatus | undefined;
      // Poll every 3 seconds if generating, otherwise don't poll
      return data?.generating ? 3000 : false;
    },
    staleTime: 2000, // Consider data stale after 2 seconds
    refetchOnWindowFocus: false,
    retry: false,
  });
}
