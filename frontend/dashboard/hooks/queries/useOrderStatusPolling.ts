import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";
import { refetchFirstPageOnly } from "../../lib/react-query-helpers";
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
  zipStatusUserSelected?: {
    isGenerating: boolean;
    type: "original";
    progress?: {
      processed: number;
      total: number;
      percent: number;
      status?: string;
      message?: string;
      error?: string;
    };
    ready: boolean;
  };
  zipStatusFinal?: {
    isGenerating: boolean;
    type: "final";
    progress?: {
      processed: number;
      total: number;
      percent: number;
      status?: string;
      message?: string;
      error?: string;
    };
    ready: boolean;
  };
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
      try {
        const response = await api.dashboard.getOrderStatuses(etagRef.current);

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
            // ETag missing warning removed
          }
          // Keep existing ETag (or undefined if first request)
          // Don't update etagRef since we didn't get a new one
        }

        return response;
      } catch (pollError: unknown) {
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

    // Track if any order's status changed significantly (for batch invalidation)
    let anyStatusChanged = false;

    // Update caches for all orders in the response
    data.orders.forEach((orderStatus) => {
      const {
        orderId,
        galleryId,
        deliveryStatus,
        paymentStatus,
        amount,
        state,
        updatedAt,
        zipStatusUserSelected,
        zipStatusFinal,
      } = orderStatus;

      // Update order detail cache
      const orderDetailKey = queryKeys.orders.detail(galleryId, orderId);
      const existingOrder = queryClient.getQueryData<Order>(orderDetailKey);

      // Track if status changed for gallery list invalidation
      let statusChanged = false;
      let oldDeliveryStatus: string | undefined;
      let userSelectedZipStatusChanged = false;
      let finalZipStatusChanged = false;

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

        // Update user-selected ZIP generation flags
        // Backend always includes zipStatusUserSelected if zipSelectedKeysHash is set
        // Use isGenerating and ready flags from backend - no guessing!
        if (zipStatusUserSelected !== undefined) {
          const wasGenerating = existingOrder.zipGenerating || false;
          const isNowGenerating = zipStatusUserSelected.isGenerating;

          updatedOrder.zipGenerating = zipStatusUserSelected.isGenerating;
          updatedOrder.zipGeneratingSince = zipStatusUserSelected.isGenerating
            ? Date.now()
            : undefined;
          // Store ready flag from backend - this is the source of truth!
          (updatedOrder as any).zipReady = zipStatusUserSelected.ready || false;
          if (zipStatusUserSelected.progress) {
            updatedOrder.zipProgress = zipStatusUserSelected.progress as any;
          }

          // Track status change for invalidation (only when generating state changes)
          userSelectedZipStatusChanged = wasGenerating !== isNowGenerating;
        } else {
          // zipStatusUserSelected is undefined - this means no ZIP was ever attempted (no zipSelectedKeysHash)
          // Clear any existing flags from cache
          if (existingOrder.zipGenerating) {
            updatedOrder.zipGenerating = false;
            updatedOrder.zipGeneratingSince = undefined;
            updatedOrder.zipProgress = undefined;
            (updatedOrder as any).zipReady = false;
            userSelectedZipStatusChanged = true;
          }
        }

        // Update final ZIP generation flags
        // Backend always includes zipStatusFinal if finalZipFilesHash is set
        // Use isGenerating and ready flags from backend - no guessing!
        if (zipStatusFinal !== undefined) {
          const wasGenerating = existingOrder.finalZipGenerating || false;
          const isNowGenerating = zipStatusFinal.isGenerating;

          updatedOrder.finalZipGenerating = zipStatusFinal.isGenerating;
          updatedOrder.finalZipGeneratingSince = zipStatusFinal.isGenerating
            ? Date.now()
            : undefined;
          // Store ready flag from backend - this is the source of truth!
          (updatedOrder as any).finalZipReady = zipStatusFinal.ready || false;
          // For finals, we also store progress in zipProgress (same field, different context)
          if (zipStatusFinal.progress) {
            updatedOrder.zipProgress = zipStatusFinal.progress as any;
          }

          // Track status change for invalidation (only when generating state changes)
          finalZipStatusChanged = wasGenerating !== isNowGenerating;
        } else {
          // zipStatusFinal is undefined - this means no final ZIP was ever attempted (no finalZipFilesHash)
          // Clear any existing flags from cache
          if (existingOrder.finalZipGenerating) {
            updatedOrder.finalZipGenerating = false;
            updatedOrder.finalZipGeneratingSince = undefined;
            (updatedOrder as any).finalZipReady = false;
            finalZipStatusChanged = true;
          }
        }

        // Update the cache - setQueryData automatically notifies subscribers
        queryClient.setQueryData<Order>(orderDetailKey, updatedOrder);

        // Track if any status changed for batch invalidation
        if (statusChanged) {
          anyStatusChanged = true;
          // Only refetch active queries if status actually changed
          // This ensures components see updates without unnecessary network calls
          void queryClient.refetchQueries({
            queryKey: orderDetailKey,
            type: "active",
          });

          // When order status changes (especially to CLIENT_APPROVED), refetch ALL gallery images queries
          // This includes both the stats query (limit: 1) and filtered queries (filterUnselected, filterOrderId)
          // This ensures the "Niewybrane" count updates correctly when client approves selection
          void refetchFirstPageOnly(queryClient, (query) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              key.length >= 3 &&
              key[0] === "galleries" &&
              key[1] === "detail" &&
              key[2] === galleryId &&
              key[3] === "images"
            );
          });
        }

        // Invalidate ZIP status queries when ZIP generation completes or starts
        // This ensures useZipStatusPolling refetches immediately to get the latest status
        if (userSelectedZipStatusChanged) {
          // Use the same query key format as useZipStatusPolling: ['zipStatus', galleryId, orderId, type]
          const zipStatusKey = ["zipStatus", galleryId, orderId, "original"];
          // Invalidate and refetch immediately to get ready status
          void queryClient.invalidateQueries({
            queryKey: zipStatusKey,
            type: "active",
            refetchType: "active", // Force immediate refetch for active queries
          });
        }

        if (finalZipStatusChanged) {
          // Use the same query key format as useZipStatusPolling: ['zipStatus', galleryId, orderId, type]
          const zipStatusKey = ["zipStatus", galleryId, orderId, "final"];
          // Invalidate and refetch immediately to get ready status
          void queryClient.invalidateQueries({
            queryKey: zipStatusKey,
            type: "active",
            refetchType: "active", // Force immediate refetch for active queries
          });
        }
      } else {
        // If order doesn't exist in cache, create minimal order object
        // Use function updater to ensure React Query detects the change
        const newOrder: Order = {
          orderId,
          galleryId,
          deliveryStatus,
          paymentStatus,
          amount,
          state,
          updatedAt,
        } as Order;

        // Add user-selected ZIP status if provided
        if (zipStatusUserSelected !== undefined) {
          (newOrder as any).zipGenerating = zipStatusUserSelected.isGenerating;
          (newOrder as any).zipGeneratingSince = zipStatusUserSelected.isGenerating
            ? Date.now()
            : undefined;
          // Store ready flag from backend - this is the source of truth!
          (newOrder as any).zipReady = zipStatusUserSelected.ready || false;
          if (zipStatusUserSelected.progress) {
            (newOrder as any).zipProgress = zipStatusUserSelected.progress;
          }
        }

        // Add final ZIP status if provided
        if (zipStatusFinal !== undefined) {
          (newOrder as any).finalZipGenerating = zipStatusFinal.isGenerating;
          (newOrder as any).finalZipGeneratingSince = zipStatusFinal.isGenerating
            ? Date.now()
            : undefined;
          // Store ready flag from backend - this is the source of truth!
          (newOrder as any).finalZipReady = zipStatusFinal.ready || false;
          if (zipStatusFinal.progress) {
            (newOrder as any).zipProgress = zipStatusFinal.progress;
          }
        }

        queryClient.setQueryData<Order>(orderDetailKey, newOrder);
      }

      // Invalidate gallery list queries when order status changes to/from CHANGES_REQUESTED
      // This ensures sidebar badges (like "Prośba o zmiany") update immediately
      // Gallery lists are filtered by order status, so they need to refetch
      if (
        statusChanged &&
        (deliveryStatus === "CHANGES_REQUESTED" || oldDeliveryStatus === "CHANGES_REQUESTED")
      ) {
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
      // This is the same key as orders.list(galleryId) used by useOrders hook
      const ordersByGalleryKey = queryKeys.orders.byGallery(galleryId);
      const existingOrdersList = queryClient.getQueryData<Order[]>(ordersByGalleryKey);

      if (existingOrdersList) {
        const orderIndex = existingOrdersList.findIndex((o) => o.orderId === orderId);
        if (orderIndex >= 0) {
          const existingOrderInList = existingOrdersList[orderIndex];
          const orderStatusChangedInList =
            existingOrderInList.deliveryStatus !== deliveryStatus ||
            existingOrderInList.paymentStatus !== paymentStatus;

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

          // Invalidate to ensure components re-render with updated data
          // This is especially important for useGalleryImageOrders which computes derived state
          // Only invalidate if status actually changed to avoid unnecessary refetches
          if (orderStatusChangedInList) {
            void queryClient.invalidateQueries({
              queryKey: ordersByGalleryKey,
            });
          }
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

          // Invalidate to ensure components re-render with new order data
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
            // setQueryData automatically notifies subscribers, no need to invalidate
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
          }
        }
      });

      // Also update all orders list cache (used by orders page)
      const allOrdersKey = queryKeys.orders.list();
      const allOrdersList = queryClient.getQueryData<Order[]>(allOrdersKey);
      if (allOrdersList) {
        const orderIndex = allOrdersList.findIndex(
          (o) => o.orderId === orderId && o.galleryId === galleryId
        );
        if (orderIndex >= 0) {
          // setQueryData automatically notifies subscribers, no need to invalidate
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
        }
      }
    });

    // Invalidate active orders queries once if any order's status changed
    // This prevents unnecessary refetches when only minor fields update
    // setQueryData above already updates the cache for known queries
    if (anyStatusChanged) {
      void queryClient.invalidateQueries({
        queryKey: ["dashboard", "activeOrders"],
      });
    }

    // Store current poll results for next comparison
    previousPollOrderIdsRef.current = currentOrderIds;

    // Update last poll time
    updateLastPollTime();
  }, [data, enablePolling, queryClient, updateLastPollTime]);

  // Handle errors (log but don't break polling)
  useEffect(() => {
    if (error) {
      // Error logging removed
      // Still update last poll time to prevent rapid retries
      updateLastPollTime();
    }
  }, [error, enablePolling, interval, isLeader, updateLastPollTime]);

  // Expose resetTimer for mutations
  return {
    resetTimer,
  };
}
