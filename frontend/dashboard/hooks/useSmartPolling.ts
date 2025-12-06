import { useQuery, useQueryClient, QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Smart polling hook that polls a query and invalidates related queries when data changes
 * Best practice: Only poll when tab is active and component is mounted
 *
 * @param queryKey - The query key to poll
 * @param pollInterval - Polling interval in milliseconds (default: 5000)
 * @param enabled - Whether polling is enabled (default: true)
 */
export function useSmartPolling(
  queryKey: QueryKey,
  pollInterval: number = 5000,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();
  const previousDataRef = useRef<unknown>();
  const isTabActiveRef = useRef(true);

  // Track tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      isTabActiveRef.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Poll query
  useQuery({
    queryKey: [...queryKey, "poll"],
    queryFn: async () => {
      if (!isTabActiveRef.current) return null;

      const currentData = queryClient.getQueryData(queryKey);

      // Compare with previous data
      if (JSON.stringify(currentData) !== JSON.stringify(previousDataRef.current)) {
        // Data changed, invalidate query to trigger refetch
        queryClient.invalidateQueries({ queryKey });
        previousDataRef.current = currentData;
      }

      return currentData;
    },
    enabled: enabled && isTabActiveRef.current,
    refetchInterval: pollInterval,
  });
}
