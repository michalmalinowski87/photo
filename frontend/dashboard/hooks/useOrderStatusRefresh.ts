import { useRef } from "react";

import api from "../lib/api-service";
import { useOrderStore } from "../store";

/**
 * Hook to refresh order status without invalidating the cache.
 * Preserves currentOrder in store to avoid null state flashes.
 */
export const useOrderStatusRefresh = () => {
  const statusLastUpdatedRef = useRef<number>(0);

  const refreshOrderStatus = async (galleryId: string, orderId: string): Promise<void> => {
    // Preserve current order BEFORE fetching status to avoid null state
    const { updateOrderFields, setCurrentOrder } = useOrderStore.getState();
    const currentOrderBeforeUpdate = useOrderStore.getState().currentOrder;

    try {
      // Fetch fresh status WITHOUT invalidating cache (preserves currentOrder)
      const statusResponse = await api.orders.getOrderStatus(galleryId, orderId);

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
        }

        // Track when status was updated to prevent cache from overwriting it
        statusLastUpdatedRef.current = Date.now();
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
