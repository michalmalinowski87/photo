"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/token";
import { getPublicApiUrl } from "@/lib/public-env";

import { useAdaptivePolling } from "./useAdaptivePolling";

const API_URL = getPublicApiUrl();

export interface ZipStatus {
  status: "ready" | "generating" | "not_started" | "error";
  generating: boolean;
  ready: boolean;
  zipExists: boolean;
  zipSize?: number;
  error?: {
    message: string;
    attempts: number;
    canRetry: boolean;
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
      } catch (error: unknown) {
        // Handle 401 (Unauthorized) - stop polling to avoid spamming the server
        // This typically means the token expired or is invalid
        const apiError = error as { status?: number; message?: string };
        if (apiError?.status === 401) {
          // Stop polling on auth errors - user may need to re-authenticate
          console.warn("ZIP status polling stopped: authentication failed (401)");
          throw error;
        }
        throw error;
      } finally {
        isPollingRef.current = false;
      }
    },
    enabled: enabled && !!galleryId && !!orderId && !!getToken(galleryId) && shouldPoll,
    refetchInterval: (rq) => {
      // Stop polling on 401 errors (auth issues)
      const error = rq.state.error as { status?: number } | undefined;
      if (error?.status === 401) {
        return false;
      }

      const data = rq.state.data as ZipStatus | undefined;
      // Stop polling once ready
      if (data?.ready) return false;
      // Stop polling if error state - no need to keep checking
      if (data?.status === "error") {
        return false;
      }
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
