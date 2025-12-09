import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import type { Order } from "../../types";
import { useSingleTabPolling } from "../useSingleTabPolling";

interface OrderStatus {
  orderId: string;
  galleryId: string;
  deliveryStatus: string;
  paymentStatus: string;
  amount: number;
  state: string;
  updatedAt: string;
}

interface OrderStatusResponse {
  orders: OrderStatus[];
  timestamp: string;
  etag?: string;
}

interface UseOrderStatusPollingOptions {
  enablePolling?: boolean;
}

/**
 * Global order status polling hook
 *
 * Features:
 * - Polls only CHANGES_REQUESTED orders via single endpoint
 * - Uses ETag/304 for efficient polling (70-90% of polls return 304)
 * - Quiet polling (no loading states)
 * - Detects new change requests by comparing with previous poll
 * - Updates React Query cache for all affected orders
 * - Prevents multiple simultaneous polls
 * - Integrates with adaptive polling for activity-based intervals
 * - Single-tab leader election (only one tab polls at a time)
 */
/* eslint-disable no-console */
export function useOrderStatusPolling(options: UseOrderStatusPollingOptions = {}) {
  const { enablePolling = false } = options;
  const queryClient = useQueryClient();
  const singleTabPolling = useSingleTabPolling();

  const previousPollOrderIdsRef = useRef<Set<string>>(new Set());
  const etagRef = useRef<string | undefined>(undefined);
  const isPollingRef = useRef<boolean>(false);

  // Query configuration - use leader election to determine if this tab should poll
  const { shouldPoll, shouldPollImmediately, resetTimer, updateLastPollTime, isLeader } =
    singleTabPolling;

  // Calculate interval for React Query (15s when should poll, false otherwise)
  const interval = shouldPoll ? 15000 : false;

  // Log polling state changes (only when polling capability actually changes, not on shouldPollImmediately flips)
  const prevPollingEnabledRef = useRef<boolean>(false);
  const prevIsLeaderRef = useRef<boolean>(false);
  useEffect(() => {
    const isPollingEnabled = enablePolling && shouldPoll;
    const prevIsPollingEnabled = prevPollingEnabledRef.current;
    const prevIsLeader = prevIsLeaderRef.current;

    // Only log when polling capability actually changes (enabled/disabled or leader status changes)
    if (prevIsPollingEnabled !== isPollingEnabled || prevIsLeader !== isLeader) {
      if (isPollingEnabled) {
        console.log("[OrderStatusPolling] Polling enabled", {
          interval: interval ? `${interval / 1000}s` : "false",
          isLeader,
        });
      } else {
        console.log("[OrderStatusPolling] Polling disabled", {
          reason: !enablePolling
            ? "disabled by option"
            : !isLeader
              ? "not leader tab"
              : "idle/hidden",
          isLeader,
        });
      }
      prevPollingEnabledRef.current = isPollingEnabled;
      prevIsLeaderRef.current = isLeader;
    }
  }, [enablePolling, shouldPoll, isLeader, interval]);

  const { data, error } = useQuery<OrderStatusResponse>({
    queryKey: ["orderStatusPolling"],
    queryFn: async () => {
      // Prevent concurrent polls
      if (isPollingRef.current) {
        // Return previous data if poll is already in progress
        const previousData = queryClient.getQueryData<OrderStatusResponse>(["orderStatusPolling"]);
        if (previousData) {
          console.log("[OrderStatusPolling] Poll already in progress, returning cached data");
          return previousData;
        }
        throw new Error("Poll already in progress");
      }

      isPollingRef.current = true;
      const pollStartTime = Date.now();
      try {
        console.log("[OrderStatusPolling] Starting poll", {
          etag: etagRef.current ?? "none",
          enablePolling,
          interval: interval ? `${interval / 1000}s` : "false",
          isLeader,
        });

        const response = await api.dashboard.getOrderStatuses(etagRef.current);
        const pollDuration = Date.now() - pollStartTime;

        // Use ETag from response (backend-generated MD5 hash)
        // Backend should always send ETag, but handle cases where it might be missing
        const hadPreviousEtag = etagRef.current !== undefined;
        
        if (response.etag) {
          // We got an ETag from the response - use it
          const etagChanged = etagRef.current !== response.etag;
          etagRef.current = response.etag;

          if (response.orders && response.orders.length > 0) {
            console.log("[OrderStatusPolling] Poll completed (200 OK)", {
              orderCount: response.orders.length,
              orderIds: response.orders.map((o) => o.orderId),
              etag: response.etag,
              etagChanged,
              duration: `${pollDuration}ms`,
            });
          } else {
            // Empty response means 304 - ETag unchanged
            console.log("[OrderStatusPolling] Poll completed (304 Not Modified)", {
              etag: response.etag,
              duration: `${pollDuration}ms`,
            });
          }
        } else {
          // No ETag in response - this is unexpected if we sent If-None-Match
          // Only warn if we had a previous ETag (meaning we sent If-None-Match header)
          if (hadPreviousEtag) {
            console.warn("[OrderStatusPolling] Response missing ETag header (expected one since If-None-Match was sent)", {
              orderCount: response.orders?.length ?? 0,
              duration: `${pollDuration}ms`,
              previousEtag: etagRef.current,
            });
          } else {
            // First request - no ETag yet, this is normal
            console.log("[OrderStatusPolling] Poll completed (no ETag in response, first request)", {
              orderCount: response.orders?.length ?? 0,
              duration: `${pollDuration}ms`,
            });
          }
          // Keep existing ETag (or undefined if first request)
          // Don't update etagRef since we didn't get a new one
        }

        return response;
      } catch (pollError) {
        const pollDuration = Date.now() - pollStartTime;
        console.error("[OrderStatusPolling] Poll failed", {
          error: pollError,
          duration: `${pollDuration}ms`,
          etag: etagRef.current ?? "none",
        });
        throw pollError;
      } finally {
        isPollingRef.current = false;
      }
    },
    enabled: enablePolling && shouldPoll,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    refetchOnMount: false, // Don't use refetchOnMount - we'll handle immediate polls manually
    staleTime: 10_000, // Prevent refetch if data is <10s old (prevents rapid tab-switch abuse)
    notifyOnChangeProps: [], // Quiet polling - no loading states
    refetchOnWindowFocus: false, // Handled by adaptive polling
    refetchOnReconnect: false, // Handled by adaptive polling
    retry: false, // Don't retry on error - just wait for next poll
  });

  // Handle immediate poll when recovering from true idle
  // Use invalidateQueries instead of refetch for cleaner integration with React Query
  const prevShouldPollImmediatelyRef = useRef<boolean>(false);
  useEffect(() => {
    if (
      shouldPollImmediately &&
      !prevShouldPollImmediatelyRef.current &&
      enablePolling &&
      shouldPoll
    ) {
      console.log("[OrderStatusPolling] Triggering immediate poll (recovering from idle)", {
        isLeader,
      });
      // Invalidate the query to trigger a refetch
      void queryClient.invalidateQueries({ queryKey: ["orderStatusPolling"] });
      updateLastPollTime();
    }
    prevShouldPollImmediatelyRef.current = shouldPollImmediately;
  }, [shouldPollImmediately, enablePolling, shouldPoll, isLeader, queryClient, updateLastPollTime]);

  // Handle successful response and update caches
  useEffect(() => {
    if (!data || !enablePolling) {
      return;
    }

    // If no orders in response (304 Not Modified), just update poll time and return
    if (data.orders.length === 0) {
      console.log("[OrderStatusPolling] No orders in response (304), updating poll time only");
      updateLastPollTime();
      return;
    }

    const currentOrderIds = new Set(data.orders.map((o) => o.orderId));
    const previousOrderIds = previousPollOrderIdsRef.current;

    // Detect new CHANGES_REQUESTED orders (orders that weren't in previous poll)
    const newOrderIds = Array.from(currentOrderIds).filter(
      (orderId) => !previousOrderIds.has(orderId)
    );

    if (newOrderIds.length > 0) {
      console.log("[OrderStatusPolling] New CHANGES_REQUESTED orders detected", {
        newOrderIds,
        totalOrders: currentOrderIds.size,
        previousOrders: Array.from(previousOrderIds),
      });
    } else {
      console.log("[OrderStatusPolling] No new orders, updating existing order caches", {
        orderCount: currentOrderIds.size,
        orderIds: Array.from(currentOrderIds),
      });
    }

    // Update caches for all orders in the response
    let cacheUpdatesCount = 0;
    data.orders.forEach((orderStatus) => {
      const { orderId, galleryId, deliveryStatus, paymentStatus, amount, state, updatedAt } =
        orderStatus;

      // Update order detail cache
      const orderDetailKey = queryKeys.orders.detail(galleryId, orderId);
      const existingOrder = queryClient.getQueryData<Order>(orderDetailKey);

      if (existingOrder) {
        // Merge status fields with existing order data
        const statusChanged =
          existingOrder.deliveryStatus !== deliveryStatus ||
          existingOrder.paymentStatus !== paymentStatus;

        // Update cache with new data
        queryClient.setQueryData<Order>(orderDetailKey, {
          ...existingOrder,
          deliveryStatus,
          paymentStatus,
          amount,
          state,
          updatedAt,
        });

        // Invalidate query to ensure React Query triggers re-renders
        // This is important because setQueryData might not always trigger subscriptions
        void queryClient.invalidateQueries({
          queryKey: orderDetailKey,
          refetchType: "none", // Don't refetch, just notify subscribers of cache change
        });

        if (statusChanged) {
          console.log("[OrderStatusPolling] Updated order detail cache", {
            orderId,
            galleryId,
            oldStatus: existingOrder.deliveryStatus,
            newStatus: deliveryStatus,
            oldPaymentStatus: existingOrder.paymentStatus,
            newPaymentStatus: paymentStatus,
          });
        }
        cacheUpdatesCount++;
      } else {
        // If order doesn't exist in cache, create minimal order object
        queryClient.setQueryData<Order>(orderDetailKey, {
          orderId,
          galleryId,
          deliveryStatus,
          paymentStatus,
          amount,
          state,
          updatedAt,
        } as Order);

        // Invalidate query to ensure React Query triggers re-renders
        void queryClient.invalidateQueries({
          queryKey: orderDetailKey,
          refetchType: "none", // Don't refetch, just notify subscribers of cache change
        });

        console.log("[OrderStatusPolling] Created new order detail cache entry", {
          orderId,
          galleryId,
          deliveryStatus,
          paymentStatus,
        });
        cacheUpdatesCount++;
      }

      // Update orders-by-gallery cache
      const ordersByGalleryKey = queryKeys.orders.byGallery(galleryId);
      const existingOrdersList = queryClient.getQueryData<Order[]>(ordersByGalleryKey);

      if (existingOrdersList) {
        const orderIndex = existingOrdersList.findIndex((o) => o.orderId === orderId);
        if (orderIndex >= 0) {
          // Update existing order in list
          const updatedOrders = [...existingOrdersList];
          updatedOrders[orderIndex] = {
            ...updatedOrders[orderIndex],
            deliveryStatus,
            paymentStatus,
            amount,
            state,
            updatedAt,
          };
          queryClient.setQueryData<Order[]>(ordersByGalleryKey, updatedOrders);

          // Invalidate query to ensure React Query triggers re-renders
          void queryClient.invalidateQueries({
            queryKey: ordersByGalleryKey,
            refetchType: "none", // Don't refetch, just notify subscribers of cache change
          });
        } else {
          // Add new order to list (shouldn't happen often, but handle it)
          queryClient.setQueryData<Order[]>(ordersByGalleryKey, [
            ...existingOrdersList,
            {
              orderId,
              galleryId,
              deliveryStatus,
              paymentStatus,
              amount,
              state,
              updatedAt,
            } as Order,
          ]);

          // Invalidate query to ensure React Query triggers re-renders
          void queryClient.invalidateQueries({
            queryKey: ordersByGalleryKey,
            refetchType: "none", // Don't refetch, just notify subscribers of cache change
          });
        }
      }
    });

    // Store current poll results for next comparison
    previousPollOrderIdsRef.current = currentOrderIds;

    // Update last poll time
    updateLastPollTime();

    console.log("[OrderStatusPolling] Cache updates completed", {
      cacheUpdatesCount,
      orderCount: currentOrderIds.size,
      timestamp: data.timestamp,
    });
  }, [data, enablePolling, queryClient, updateLastPollTime]);

  // Handle errors (log but don't break polling)
  useEffect(() => {
    if (error) {
      console.error("[OrderStatusPolling] Poll error (will retry on next interval)", {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        enablePolling,
        interval: interval ? `${interval / 1000}s` : "false",
        isLeader,
        etag: etagRef.current ?? "none",
      });
      // Still update last poll time to prevent rapid retries
      updateLastPollTime();
    }
  }, [error, enablePolling, interval, isLeader, updateLastPollTime]);

  // Expose resetTimer for mutations
  return {
    resetTimer,
  };
}
