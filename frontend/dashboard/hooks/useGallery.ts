import { useRouter } from "next/router";
import { useCallback } from "react";

import { useGalleryStore, type Gallery } from "../store/gallerySlice";
import { useOrderStore } from "../store/orderSlice";

/**
 * Hook for accessing gallery data from Zustand store
 * This replaces useGallery from GalleryContext
 *
 * @returns Object with gallery, loading, error, galleryId, reloadGallery, reloadOrder
 */
export const useGallery = () => {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const currentGallery = useGalleryStore((state) => state.currentGallery);
  const isLoading = useGalleryStore((state) => state.isLoading);
  const error = useGalleryStore((state) => state.error);
  const fetchGallery = useGalleryStore((state) => state.fetchGallery);
  const fetchOrder = useOrderStore((state) => state.fetchOrder);

  const reloadGallery = useCallback(async () => {
    if (galleryId && typeof galleryId === "string") {
      await fetchGallery(galleryId, true); // Force refresh
    }
  }, [galleryId, fetchGallery]);

  // Get reloadOrder from useOrderStore if orderId exists
  const reloadOrder = useCallback(async () => {
    if (galleryId && orderId && typeof galleryId === "string" && typeof orderId === "string") {
      await fetchOrder(galleryId, orderId, true); // Force refresh
    }
  }, [galleryId, orderId, fetchOrder]);

  return {
    gallery: currentGallery as Gallery | null,
    loading: isLoading,
    error,
    galleryId: galleryId as string | undefined,
    reloadGallery,
    reloadOrder: orderId ? reloadOrder : undefined,
  };
};
