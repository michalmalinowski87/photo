import { useCallback } from "react";

import api, { formatApiError } from "../lib/api-service";
import { useGalleryStore } from "../store/gallerySlice";
import { useToast } from "./useToast";

interface Order {
  orderId?: string;
  galleryId?: string;
  deliveryStatus?: string;
  [key: string]: unknown;
}

interface UseGalleryDataOptions {
  apiUrl?: string; // Deprecated - kept for backward compatibility but not used
  idToken?: string; // Deprecated - kept for backward compatibility but not used
  galleryId: string | string[] | undefined;
  setGalleryUrl: (url: string) => void;
  setGalleryOrdersLocal: (orders: Order[]) => void;
  setHasDeliveredOrders: (hasDelivered: boolean) => void;
}

export const useGalleryData = ({
  apiUrl,
  idToken,
  galleryId,
  setGalleryUrl,
  setGalleryOrdersLocal,
  setHasDeliveredOrders,
}: UseGalleryDataOptions) => {
  const { showToast } = useToast();
  const {
    currentGallery: gallery,
    setLoading,
    setError,
    fetchGallery,
    fetchGalleryOrders,
    isGalleryStale,
  } = useGalleryStore();

  const loadGalleryData = useCallback(
    async (silent = false, forceRefresh = false) => {
      if (!galleryId) {
        return;
      }

      // Check cache first (unless forcing refresh)
      if (!forceRefresh && gallery?.galleryId === galleryId && !isGalleryStale(30000)) {
        // Use cached data, but update URL if needed
        setGalleryUrl(
          typeof window !== "undefined" ? `${window.location.origin}/gallery/${galleryId}` : ""
        );
        return;
      }

      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        // Use store action - checks cache first, fetches if needed
        await fetchGallery(galleryId as string, forceRefresh);
        
        setGalleryUrl(
          typeof window !== "undefined"
            ? `${window.location.origin}/gallery/${galleryId as string}`
            : ""
        );

        // Dispatch galleryUpdated event to notify components (e.g., PaymentGuidanceBanner, GallerySidebar)
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("galleryUpdated", { detail: { galleryId } }));
        }
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
    [
      galleryId,
      gallery,
      setLoading,
      setError,
      fetchGallery,
      showToast,
      isGalleryStale,
      setGalleryUrl,
    ]
  );

  const loadGalleryOrders = useCallback(
    async (forceRefresh = false) => {
      if (!galleryId) {
        return;
      }

      try {
        // Use store action - checks cache first, fetches if needed
        const orders = await fetchGalleryOrders(galleryId as string, forceRefresh);
        
        // Type guard to ensure orders match Order interface
        const typedOrders: Order[] = orders.filter(
          (order): order is Order =>
            typeof order === "object" &&
            order !== null &&
            "orderId" in order &&
            typeof (order as { orderId?: unknown }).orderId === "string"
        );
        setGalleryOrdersLocal(typedOrders);
      } catch (_err) {
        setGalleryOrdersLocal([]);
      }
    },
    [galleryId, fetchGalleryOrders, setGalleryOrdersLocal]
  );

  const checkDeliveredOrders = useCallback(async () => {
    if (!galleryId) {
      return;
    }
    try {
      const response = await api.galleries.checkDeliveredOrders(galleryId as string);
      const items = response.items ?? [];
      setHasDeliveredOrders(Array.isArray(items) && items.length > 0);
    } catch (_err) {
      setHasDeliveredOrders(false);
    }
  }, [galleryId, setHasDeliveredOrders]);

  return {
    loadGalleryData,
    loadGalleryOrders,
    checkDeliveredOrders,
  };
};
