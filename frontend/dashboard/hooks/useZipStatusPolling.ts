import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import api from "../lib/api-service";
import { useAdaptivePolling } from "./useAdaptivePolling";

interface ZipStatus {
  status: "ready" | "generating" | "not_started" | "error";
  generating: boolean;
  ready: boolean;
  zipExists: boolean;
  zipSize?: number;
  error?: {
    message: string;
    attempts: number;
    canRetry: boolean;
    details?: any[];
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
  const {
    interval: adaptiveInterval,
    shouldPollImmediately,
    updateLastPollTime,
  } = useAdaptivePolling();
  const shouldPoll = adaptiveInterval !== null;

  const queryKey = ["zipStatus", galleryId, orderId, type];

  const { data, error } = useQuery<ZipStatus>({
    queryKey,
    queryFn: async () => {
      // React Query handles request deduplication automatically,
      // so we don't need isPollingRef here - multiple components using the same
      // query key will share the same request
      const result =
        type === "final"
          ? await api.orders.getFinalZipStatus(galleryId, orderId)
          : await api.orders.getZipStatus(galleryId, orderId);

      updateLastPollTime();

      return result;
    },
    enabled: enabled && shouldPoll,
    refetchInterval: (rq) => {
      // Stop polling if query failed with HTTP error (404, etc.) - won't recover
      if (rq.state.error) {
        const errorWithStatus = rq.state.error as { status?: number };
        const status = errorWithStatus?.status;
        // Stop polling on client errors (4xx) - these are permanent
        if (status && status >= 400 && status < 500) {
          return false;
        }
      }
      // Stop polling once ready - ZIP is complete
      const data = rq.state.data as ZipStatus | undefined;
      if (data?.ready) {
        return false;
      }
      // Stop polling if error state - no need to keep checking
      if (data?.status === "error") {
        return false;
      }
      // Poll every 15s when enabled and should poll, otherwise stop
      return shouldPoll && enabled ? 15000 : false;
    },
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
    error,
    isLoading: !data && !error,
    zipStatus: data, // Return full status object for error checking
  };
}
