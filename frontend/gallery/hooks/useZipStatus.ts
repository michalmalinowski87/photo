"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/token";
import { getPublicApiUrl } from "@/lib/public-env";

import { useAdaptivePolling } from "./useAdaptivePolling";

const API_URL = getPublicApiUrl();

export interface ZipStatus {
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
  const queryClient = useQueryClient();
  const { interval: adaptiveInterval, shouldPollImmediately, updateLastPollTime } =
    useAdaptivePolling();
  const shouldPoll = adaptiveInterval !== null;

  const queryKey = ["zipStatus", galleryId, orderId, "final"];
  const isPollingRef = useRef<boolean>(false);

  const query = useQuery<ZipStatus>({
    queryKey,
    queryFn: async () => {
      if (!galleryId || !orderId) {
        throw new Error("Missing galleryId or orderId");
      }

      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      // Prevent concurrent polls
      if (isPollingRef.current) {
        return (
          queryClient.getQueryData<ZipStatus>(queryKey) || {
            status: "not_started" as const,
            generating: false,
            ready: false,
            zipExists: false,
          }
        );
      }

      isPollingRef.current = true;

      try {
        const response = await apiFetch(
          `${API_URL}/galleries/${galleryId}/orders/${orderId}/final/zip/status`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        updateLastPollTime();
        return response.data as ZipStatus;
      } finally {
        isPollingRef.current = false;
      }
    },
    enabled: enabled && !!galleryId && !!orderId && !!getToken(galleryId) && shouldPoll,
    refetchInterval: (rq) => {
      const data = rq.state.data as ZipStatus | undefined;
      // Stop polling once ready
      if (data?.ready) return false;
      // Faster updates when generating, otherwise keep it light (dashboard-style)
      return data?.generating ? 3000 : 15000;
    },
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    staleTime: 10_000,
    notifyOnChangeProps: ["data"],
    refetchOnWindowFocus: false, // handled by adaptive polling
    refetchOnReconnect: false, // handled by adaptive polling
    retry: false,
  });

  // Immediate poll only when coming back from true idle (60s+), not on tab switch
  const prevShouldPollImmediatelyRef = useRef<boolean>(false);
  useEffect(() => {
    if (
      shouldPollImmediately &&
      !prevShouldPollImmediatelyRef.current &&
      enabled &&
      shouldPoll &&
      galleryId &&
      orderId
    ) {
      void queryClient.invalidateQueries({ queryKey });
      updateLastPollTime();
    }
    prevShouldPollImmediatelyRef.current = shouldPollImmediately;
  }, [
    shouldPollImmediately,
    enabled,
    shouldPoll,
    queryClient,
    queryKey,
    updateLastPollTime,
    galleryId,
    orderId,
  ]);

  return query;
}
