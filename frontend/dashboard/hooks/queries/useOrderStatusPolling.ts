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
 * - Polls CHANGES_REQUESTED and CLIENT_APPROVED orders via single endpoint
 * - Uses ETag/304 for efficient polling (70-90% of polls return 304)
 * - Quiet polling (no loading states)
 * - Detects new change requests and approvals by comparing with previous poll
 * - Updates React Query cache for all affected orders
 * - Prevents multiple simultaneous polls
 * - Integrates with adaptive polling for activity-based intervals
 * - Single-tab leader election (only one tab polls at a time)
 */
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

  // Track polling state changes
  const prevPollingEnabledRef = useRef<boolean>(false);
  const prevIsLeaderRef = useRef<boolean>(false);
  useEffect(() => {
    const isPollingEnabled = enablePolling && shouldPoll;
    prevPollingEnabledRef.current = isPollingEnabled;
    prevIsLeaderRef.current = isLeader;
  }, [enablePolling, shouldPoll, isLeader]);

  const { data, error } = useQuery<OrderStatusResponse>({
    queryKey: ["orderStatusPolling"],
    queryFn: async () => {
      // Prevent concurrent polls
      if (isPollingRef.current) {
        // Return previous data if poll is already in progress
        const previousData = queryClient.getQueryData<OrderStatusResponse>(["orderStatusPolling"]);
        if (previousData) {
          return previousData;
        }
        throw new Error("Poll already in progress");
      }

      isPollingRef.current = true;
      const pollStartTime = Date.now();
      try {
        const response = await api.dashboard.getOrderStatuses(etagRef.current);
        const pollDuration = Date.now() - pollStartTime;

        // Use ETag from response (backend-generated MD5 hash)
        // Backend should always send ETag, but handle cases where it might be missing
        const hadPreviousEtag = etagRef.current !== undefined;
        
        if (response.etag) {
          // We got an ETag from the response - use it
          etagRef.current = response.etag;
        } else {
          // No ETag in response - this is unexpected if we sent If-None-Match
          // Only warn if we had a previous ETag (meaning we sent If-None-Match header)
          if (hadPreviousEtag) {
            console.warn("[OrderStatusPolling] Response missing ETag header (expected one since If-None-Match was sent)", {
              orderCount: response.orders?.length ?? 0,
              duration: `${pollDuration}ms`,
              previousEtag: etagRef.current,
            });
          }
          // Keep existing ETag (or undefined if first request)
          // Don't update etagRef since we didn't get a new one
        }

        return response;
      } catch (pollError: unknown) {
        const pollDuration = Date.now() - pollStartTime;
        const errorDetails = pollError instanceof Error
          ? {
              name: pollError.name,
              message: pollError.message,
              stack: pollError.stack,
            }
          : pollError;
        console.error("[OrderStatusPolling] Poll failed", {
          error: errorDetails,
          duration: `${pollDuration}ms`,
          etag: etagRef.current ?? "none",
        });
        throw pollError instanceof Error ? pollError : new Error(String(pollError));
      } finally {
        isPollingRef.current = false;
      }
    },
    enabled: enablePolling && shouldPoll,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    refetchOnMount: false, // Don't use refetchOnMount - we'll handle immediate polls manually
    staleTime: 10_000, // Prevent refetch if data is <10s old (prevents rapid tab-switch abuse)
    notifyOnChangeProps: ["data"], // Only notify on data changes, not loading states (quiet polling)
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
      // Invalidate the query to trigger a refetch
      void queryClient.invalidateQueries({ queryKey: ["orderStatusPolling"] });
      updateLastPollTime();
    }
    prevShouldPollImmediatelyRef.current = shouldPollImmediately;
  }, [shouldPollImmediately, enablePolling, shouldPoll, queryClient, updateLastPollTime]);

  // Handle successful response and update caches
  useEffect(() => {
    if (!data || !enablePolling) {
      return;
    }

    // If no orders in response (304 Not Modified), just update poll time and return
    if (!data.orders || data.orders.length === 0) {
      updateLastPollTime();
      return;
    }

    const currentOrderIds = new Set(data.orders.map((o) => o.orderId));

    // Update caches for all orders in the response
    data.orders.forEach((orderStatus) => {
      const { orderId, galleryId, deliveryStatus, paymentStatus, amount, state, updatedAt } =
        orderStatus;

      // Update order detail cache
      const orderDetailKey = queryKeys.orders.detail(galleryId, orderId);
      const existingOrder = queryClient.getQueryData<Order>(orderDetailKey);

      // Track if status changed for gallery list invalidation
      let statusChanged = false;
      let oldDeliveryStatus: string | undefined;

      if (existingOrder) {
        // Merge status fields with existing order data
        oldDeliveryStatus = existingOrder.deliveryStatus;
        statusChanged =
          existingOrder.deliveryStatus !== deliveryStatus ||
          existingOrder.paymentStatus !== paymentStatus;

        // Update cache with new data
        const updatedOrder: Order = {
          ...existingOrder,
          deliveryStatus,
          paymentStatus,
          amount,
          state,
          updatedAt,
        };
        
        // Update the cache
        queryClient.setQueryData<Order>(orderDetailKey, updatedOrder);
        
        // Mark query as stale and invalidate to force React Query to check the cache
        // This ensures components re-render even with placeholderData
        void queryClient.invalidateQueries({
          queryKey: orderDetailKey,
        });
        
        // Refetch active queries - they'll use the updated cache if data is fresh
        void queryClient.refetchQueries({
          queryKey: orderDetailKey,
          type: "active",
        });
      } else {
        // If order doesn't exist in cache, create minimal order object
        // Use function updater to ensure React Query detects the change
        queryClient.setQueryData<Order>(orderDetailKey, () => ({
          orderId,
          galleryId,
          deliveryStatus,
          paymentStatus,
          amount,
          state,
          updatedAt,
        } as Order));
      }

      // Invalidate gallery list queries when order status changes to/from CHANGES_REQUESTED
      // This ensures sidebar badges (like "Prośba o zmiany") update immediately
      // Gallery lists are filtered by order status, so they need to refetch
      if (statusChanged && (deliveryStatus === "CHANGES_REQUESTED" || oldDeliveryStatus === "CHANGES_REQUESTED")) {
        // Invalidate all gallery list queries (they filter by order status)
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.lists(),
        });
      } else if (!existingOrder && deliveryStatus === "CHANGES_REQUESTED") {
        // If order is new and has CHANGES_REQUESTED status, invalidate gallery lists
        void queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.lists(),
        });
      }

      // Update orders-by-gallery cache
      const ordersByGalleryKey = queryKeys.orders.byGallery(galleryId);
      const existingOrdersList = queryClient.getQueryData<Order[]>(ordersByGalleryKey);

      if (existingOrdersList) {
        const orderIndex = existingOrdersList.findIndex((o) => o.orderId === orderId);
        if (orderIndex >= 0) {
          // Update existing order in list using function updater
          queryClient.setQueryData<Order[]>(ordersByGalleryKey, (old) => {
            if (!old) return old;
            const updatedOrders = [...old];
            updatedOrders[orderIndex] = {
              ...updatedOrders[orderIndex],
              deliveryStatus,
              paymentStatus,
              amount,
              state,
              updatedAt,
            };
            return updatedOrders;
          });
          
          // Invalidate to trigger re-renders
          void queryClient.invalidateQueries({
            queryKey: ordersByGalleryKey,
          });
        } else {
          // Add new order to list (shouldn't happen often, but handle it)
          queryClient.setQueryData<Order[]>(ordersByGalleryKey, (old) => {
            if (!old) return old;
            return [
              ...old,
              {
                orderId,
                galleryId,
                deliveryStatus,
                paymentStatus,
                amount,
                state,
                updatedAt,
              } as Order,
            ];
          });
          
          // Invalidate to trigger re-renders
          void queryClient.invalidateQueries({
            queryKey: ordersByGalleryKey,
          });
        }
      }

      // Update dashboard active orders cache (used by dashboard page)
      // Find and update all active orders queries that might contain this order
      // Use base key to match all active orders queries regardless of params
      const activeOrdersQueries = queryClient.getQueryCache().findAll({
        queryKey: ["dashboard", "activeOrders"],
      });
      
      activeOrdersQueries.forEach((query) => {
        const cachedData = query.state.data as Order[] | undefined;
        if (cachedData && Array.isArray(cachedData)) {
          const orderIndex = cachedData.findIndex(
            (o) => o.orderId === orderId && o.galleryId === galleryId
          );
          if (orderIndex >= 0) {
            queryClient.setQueryData<Order[]>(query.queryKey, (old) => {
              if (!old) return old;
              const updatedOrders = [...old];
              updatedOrders[orderIndex] = {
                ...updatedOrders[orderIndex],
                deliveryStatus,
                paymentStatus,
                amount,
                state,
                updatedAt,
              };
              return updatedOrders;
            });
            
            // Invalidate this specific query to trigger re-renders
            void queryClient.invalidateQueries({
              queryKey: query.queryKey,
            });
          }
        }
      });
      
      // Always invalidate all active orders queries to ensure dashboard updates
      // This ensures any queries we missed will refetch
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", "activeOrders"],
      });
      
      // Also update all orders list cache (used by orders page)
      const allOrdersKey = queryKeys.orders.list();
      const allOrdersList = queryClient.getQueryData<Order[]>(allOrdersKey);
      if (allOrdersList) {
        const orderIndex = allOrdersList.findIndex(
          (o) => o.orderId === orderId && o.galleryId === galleryId
        );
        if (orderIndex >= 0) {
          queryClient.setQueryData<Order[]>(allOrdersKey, (old) => {
            if (!old) return old;
            const updatedOrders = [...old];
            updatedOrders[orderIndex] = {
              ...updatedOrders[orderIndex],
              deliveryStatus,
              paymentStatus,
              amount,
              state,
              updatedAt,
            };
            return updatedOrders;
          });
          
          // Invalidate to trigger re-renders
          void queryClient.invalidateQueries({
            queryKey: allOrdersKey,
          });
        }
      }
    });

    // Store current poll results for next comparison
    previousPollOrderIdsRef.current = currentOrderIds;

    // Update last poll time
    updateLastPollTime();
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
