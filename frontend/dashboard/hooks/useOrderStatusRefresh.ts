import { useRef } from "react";

import api from "../lib/api-service";
import { useOrderStore } from "../store/orderSlice";

/**
 * Hook to refresh order status without invalidating the cache.
 * Preserves currentOrder in store to avoid null state flashes.
 */
export const useOrderStatusRefresh = () => {
  const statusLastUpdatedRef = useRef<number>(0);

  const refreshOrderStatus = async (galleryId: string, orderId: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log("[STATUS_UPDATE] Starting status refresh", {
      galleryId,
      orderId,
      currentOrderInStore: useOrderStore.getState().currentOrder?.orderId,
    });

    // Preserve current order BEFORE fetching status to avoid null state
    const { updateOrderFields, setCurrentOrder } = useOrderStore.getState();
    const currentOrderBeforeUpdate = useOrderStore.getState().currentOrder;

    try {
      // Fetch fresh status WITHOUT invalidating cache (preserves currentOrder)
      const statusResponse = await api.orders.getOrderStatus(galleryId, orderId);

      // eslint-disable-next-line no-console
      console.log("[STATUS_UPDATE] Status response received", {
        deliveryStatus: statusResponse?.deliveryStatus,
        paymentStatus: statusResponse?.paymentStatus,
        currentOrderBeforeUpdate: currentOrderBeforeUpdate?.orderId,
      });

      if (statusResponse) {
        // Update the order store cache with fresh status
        updateOrderFields(orderId, {
          deliveryStatus: statusResponse.deliveryStatus,
          paymentStatus: statusResponse.paymentStatus,
          amount: statusResponse.amount,
          state: statusResponse.state,
          updatedAt: statusResponse.updatedAt,
        });

        // CRITICAL: Update currentOrder in place (preserve all fields, only update status fields)
        if (currentOrderBeforeUpdate && currentOrderBeforeUpdate.orderId === orderId) {
          setCurrentOrder({
            ...currentOrderBeforeUpdate,
            deliveryStatus: statusResponse.deliveryStatus,
            paymentStatus: statusResponse.paymentStatus,
            amount: statusResponse.amount,
            state: statusResponse.state,
            updatedAt: statusResponse.updatedAt,
          });

          // eslint-disable-next-line no-console
          console.log("[STATUS_UPDATE] currentOrder updated in store", {
            deliveryStatus: statusResponse.deliveryStatus,
            paymentStatus: statusResponse.paymentStatus,
          });
        } else {
          // eslint-disable-next-line no-console
          console.warn("[STATUS_UPDATE] currentOrder not found in store", {
            expectedOrderId: orderId,
            currentOrderId: currentOrderBeforeUpdate?.orderId,
          });
        }

        // Track when status was updated to prevent cache from overwriting it
        statusLastUpdatedRef.current = Date.now();
      } else {
        // eslint-disable-next-line no-console
        console.error("[STATUS_UPDATE] No status response received");
      }
    } catch (statusErr) {
      // eslint-disable-next-line no-console
      console.error("[STATUS_UPDATE] Failed to refresh order status", statusErr);
      throw statusErr;
    }
  };

  return {
    refreshOrderStatus,
    statusLastUpdatedRef,
  };
};
