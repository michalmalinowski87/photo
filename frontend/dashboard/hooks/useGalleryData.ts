import { useCallback } from "react";

import { useToast } from "./useToast";
import { apiFetchWithAuth, formatApiError } from "../lib/api";
import { useGalleryStore } from "../store/gallerySlice";

interface Order {
  orderId?: string;
  galleryId?: string;
  deliveryStatus?: string;
  [key: string]: unknown;
}

interface UseGalleryDataOptions {
  apiUrl: string;
  idToken: string;
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
    setCurrentGallery,
    setGalleryOrders,
    getGalleryOrders,
    isGalleryStale,
  } = useGalleryStore();

  const loadGalleryData = useCallback(
    async (silent = false, forceRefresh = false) => {
      if (!apiUrl || !idToken || !galleryId) {
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
        const galleryResponse = await apiFetchWithAuth(
          `${apiUrl}/galleries/${galleryId as string}`
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        setCurrentGallery(galleryResponse.data as any);
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
      apiUrl,
      idToken,
      galleryId,
      gallery,
      setLoading,
      setError,
      setCurrentGallery,
      showToast,
      isGalleryStale,
      setGalleryUrl,
    ]
  );

  const loadGalleryOrders = useCallback(
    async (forceRefresh = false) => {
      if (!apiUrl || !galleryId) {
        return;
      }

      // Check cache first (unless forcing refresh)
      if (!forceRefresh) {
        const cached = getGalleryOrders(galleryId as string, 30000);
        if (cached) {
          setGalleryOrdersLocal(cached);
          return;
        }
      }

      try {
        const { data } = await apiFetchWithAuth<{ items?: unknown[] }>(
          `${apiUrl}/galleries/${galleryId as string}/orders`
        );
        const orders = data?.items ?? [];
        const ordersArray = Array.isArray(orders) ? orders : [];
        setGalleryOrdersLocal(ordersArray as Order[]);
        // Cache the orders in Zustand store
        setGalleryOrders(galleryId as string, ordersArray);
      } catch (_err) {
        setGalleryOrdersLocal([]);
      }
    },
    [apiUrl, galleryId, getGalleryOrders, setGalleryOrders, setGalleryOrdersLocal]
  );

  const checkDeliveredOrders = useCallback(async () => {
    if (!apiUrl || !galleryId) {
      return;
    }
    try {
      const { data } = await apiFetchWithAuth<{ items?: unknown[]; orders?: unknown[] }>(
        `${apiUrl}/galleries/${galleryId as string}/orders/delivered`
      );
      const items = data?.items ?? data?.orders ?? [];
      setHasDeliveredOrders(Array.isArray(items) && items.length > 0);
    } catch (_err) {
      setHasDeliveredOrders(false);
    }
  }, [apiUrl, galleryId, setHasDeliveredOrders]);

  return {
    loadGalleryData,
    loadGalleryOrders,
    checkDeliveredOrders,
  };
};

