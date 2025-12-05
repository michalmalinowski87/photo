import { useRouter } from "next/router";
import { useCallback } from "react";

import { useGalleryStore, useOrderStore } from "../store";

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
      await fetchGallery(galleryId);
    }
  }, [galleryId, fetchGallery]);

  // Get reloadOrder from useOrderStore if orderId exists
  const reloadOrder = useCallback(async () => {
    if (galleryId && orderId && typeof galleryId === "string" && typeof orderId === "string") {
      await fetchOrder(galleryId, orderId);
    }
  }, [galleryId, orderId, fetchOrder]);

  return {
    gallery: currentGallery,
    loading: isLoading,
    error,
    galleryId: galleryId as string | undefined,
    reloadGallery,
    reloadOrder: orderId ? reloadOrder : undefined,
  };
};
