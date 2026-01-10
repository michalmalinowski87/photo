import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import api from "../lib/api-service";
import { useAdaptivePolling } from "./useAdaptivePolling";

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

interface UseZipStatusPollingOptions {
  galleryId: string;
  orderId: string;
  type: "original" | "final";
  enabled?: boolean;
}

/**
 * Hook to poll ZIP generation status with progress updates
 * Uses adaptive polling (15s interval when active, pauses when idle/hidden)
 * Similar mechanics to useOrderStatusPolling
 */
export function useZipStatusPolling({
  galleryId,
  orderId,
  type,
  enabled = true,
}: UseZipStatusPollingOptions) {
  const queryClient = useQueryClient();
  const { interval: adaptiveInterval, shouldPollImmediately, updateLastPollTime } = useAdaptivePolling();
  const shouldPoll = adaptiveInterval !== null;

  // Calculate interval for React Query (15s when should poll, false otherwise)
  const interval = shouldPoll && enabled ? 15000 : false;

  const queryKey = ["zipStatus", galleryId, orderId, type];
  const isPollingRef = useRef<boolean>(false);

  const { data, error } = useQuery<ZipStatus>({
    queryKey,
    queryFn: async () => {
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
        const result =
          type === "final"
            ? await api.orders.getFinalZipStatus(galleryId, orderId)
            : await api.orders.getZipStatus(galleryId, orderId);

        updateLastPollTime();

        return result;
      } catch (pollError: unknown) {
        throw pollError instanceof Error ? pollError : new Error(String(pollError));
      } finally {
        isPollingRef.current = false;
      }
    },
    enabled: enabled && shouldPoll,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    staleTime: 10_000, // Prevent refetch if data is <10s old
    notifyOnChangeProps: ["data"], // Only notify on data changes, not loading states
    refetchOnWindowFocus: false, // Handled by adaptive polling
    refetchOnReconnect: false, // Handled by adaptive polling
    retry: false, // Don't retry on error - just wait for next poll
  });

  // Handle immediate poll when recovering from true idle
  const prevShouldPollImmediatelyRef = useRef<boolean>(false);
  useEffect(() => {
    if (shouldPollImmediately && !prevShouldPollImmediatelyRef.current && enabled && shouldPoll) {
      // Invalidate the query to trigger a refetch
      void queryClient.invalidateQueries({ queryKey });
      updateLastPollTime();
    }
    prevShouldPollImmediatelyRef.current = shouldPollImmediately;
  }, [shouldPollImmediately, enabled, shouldPoll, queryClient, queryKey, updateLastPollTime]);

  return {
    status: data?.status || "not_started",
    generating: data?.generating || false,
    ready: data?.ready || false,
    zipExists: data?.zipExists || false,
    zipSize: data?.zipSize,
    elapsedSeconds: data?.elapsedSeconds,
    progress: data?.progress,
    error,
    isLoading: !data && !error,
    zipStatus: data, // Return full status object for error checking
  };
}
