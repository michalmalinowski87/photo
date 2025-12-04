import { useCallback } from "react";

import { formatApiError } from "../lib/api-service";
import { useGalleryStore } from "../store";
import { useToast } from "./useToast";

interface UseGalleryDataOptions {
  galleryId: string | string[] | undefined;
}

/**
 * Simplified hook that calls store actions directly
 * All state is managed in the store, no local state setters needed
 */
export const useGalleryData = ({ galleryId }: UseGalleryDataOptions) => {
  const { showToast } = useToast();
  const {
    setLoading,
    setError,
    fetchGallery,
    fetchGalleryOrders,
    checkDeliveredOrders: checkDeliveredOrdersAction,
    setGalleryUrl,
  } = useGalleryStore();

  const loadGalleryData = useCallback(
    async (silent = false, forceRefresh = false, bytesOnly = false) => {
      if (!galleryId) {
        return;
      }

      // If bytesOnly is true, use silent refresh that only updates bytes
      if (bytesOnly) {
        const { refreshGalleryBytesOnly } = useGalleryStore.getState();
        await refreshGalleryBytesOnly(galleryId as string);
        return;
      }

      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        // Use store action - checks cache first, fetches if needed
        await fetchGallery(galleryId as string, forceRefresh);

        // Update gallery URL in store
        setGalleryUrl(
          typeof window !== "undefined"
            ? `${window.location.origin}/gallery/${galleryId as string}`
            : ""
        );

        // Zustand state update will trigger re-renders automatically via subscriptions
      } catch (err) {
        if (!silent) {
          const errorMsg = formatApiError(err);
          setError(errorMsg ?? "Nie udało się załadować danych galerii");
          showToast("error", "Błąd", errorMsg ?? "Nie udało się załadować danych galerii");
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [galleryId, setLoading, setError, fetchGallery, showToast, setGalleryUrl]
  );

  const loadGalleryOrders = useCallback(
    async (forceRefresh = false) => {
      if (!galleryId) {
        return;
      }

      try {
        // Use store action - checks cache first, fetches if needed
        // Store action automatically updates galleryOrders state
        await fetchGalleryOrders(galleryId as string, forceRefresh);
      } catch (_err) {
        // Store action handles errors internally
      }
    },
    [galleryId, fetchGalleryOrders]
  );

  const checkDeliveredOrders = useCallback(async () => {
    if (!galleryId) {
      return;
    }
    // Use store action - updates hasDeliveredOrders state automatically
    await checkDeliveredOrdersAction(galleryId as string);
  }, [galleryId, checkDeliveredOrdersAction]);

  return {
    loadGalleryData,
    loadGalleryOrders,
    checkDeliveredOrders,
  };
};
