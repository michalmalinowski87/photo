import { useRouter } from "next/router";
import { useCallback } from "react";

import { useGallery as useGalleryQuery } from "./queries/useGalleries";
import { useOrder as useOrderQuery } from "./queries/useOrders";

/**
 * Hook for accessing gallery data from React Query
 * This replaces the old Zustand-based useGallery hook
 *
 * @returns Object with gallery, loading, error, galleryId, reloadGallery, reloadOrder
 */
export const useGallery = () => {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;

  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
  const orderIdForQuery = orderIdStr && typeof orderIdStr === "string" ? orderIdStr : undefined;

  const {
    data: gallery,
    isLoading,
    error,
    refetch: refetchGallery,
  } = useGalleryQuery(galleryIdForQuery);

  // Order query should be enabled when both IDs exist - let React Query handle refetching automatically
  const { refetch: refetchOrder } = useOrderQuery(galleryIdForQuery, orderIdForQuery);

  const reloadGallery = useCallback(async () => {
    if (galleryIdForQuery) {
      await refetchGallery();
    }
  }, [galleryIdForQuery, refetchGallery]);

  const reloadOrder = useCallback(async () => {
    if (galleryIdForQuery && orderIdForQuery) {
      await refetchOrder();
    }
  }, [galleryIdForQuery, orderIdForQuery, refetchOrder]);

  return {
    gallery: gallery ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    galleryId: galleryIdForQuery,
    reloadGallery,
    reloadOrder: orderIdForQuery ? reloadOrder : undefined,
  };
};
