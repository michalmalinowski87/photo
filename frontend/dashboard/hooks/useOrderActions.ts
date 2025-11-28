import { useCallback } from "react";

import { useZipDownload as useZipDownloadHook } from "../hocs/withZipDownload";
import { useToast } from "./useToast";
import { apiFetch, formatApiError } from "../lib/api";
import { useGalleryStore } from "../store/gallerySlice";
import { useOrderStore } from "../store/orderSlice";

interface UseOrderActionsOptions {
  apiUrl: string;
  idToken: string;
  galleryId: string | string[] | undefined;
  orderId: string | string[] | undefined;
  loadOrderData: () => Promise<void>;
  loadGalleryOrders: (forceRefresh?: boolean) => Promise<void>;
  openDenyModal: () => void;
  closeDenyModal: () => void;
  setDenyLoading: (loading: boolean) => void;
}

export const useOrderActions = ({
  apiUrl,
  idToken,
  galleryId,
  orderId,
  loadOrderData,
  loadGalleryOrders,
  openDenyModal,
  closeDenyModal,
  setDenyLoading,
}: UseOrderActionsOptions) => {
  const { showToast } = useToast();
  const { downloadZip } = useZipDownloadHook();
  const { invalidateGalleryCache, invalidateGalleryOrdersCache } = useGalleryStore();
  const { invalidateOrderCache } = useOrderStore();
  const invalidateOrderStoreGalleryCache = useOrderStore(
    (state) => state.invalidateGalleryOrdersCache
  );

  const handleApproveChangeRequest = useCallback(async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) {
      return;
    }

    try {
      await apiFetch(
        `${apiUrl}/galleries/${galleryId as string}/orders/${orderId as string}/approve-change`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );

      // Invalidate cache to force fresh data fetch
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      invalidateOrderCache(orderId as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      invalidateGalleryOrdersCache(galleryId as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      invalidateOrderStoreGalleryCache(galleryId as string);

      showToast(
        "success",
        "Sukces",
        "Prośba o zmiany została zatwierdzona. Klient może teraz modyfikować wybór."
      );
      await loadOrderData();
      await loadGalleryOrders(true); // Force refresh
    } catch (err) {
      showToast(
        "error",
        "Błąd",
        formatApiError(err) ?? "Nie udało się zatwierdzić prośby o zmiany"
      );
    }
  }, [
    apiUrl,
    idToken,
    galleryId,
    orderId,
    invalidateOrderCache,
    invalidateGalleryOrdersCache,
    invalidateOrderStoreGalleryCache,
    showToast,
    loadOrderData,
    loadGalleryOrders,
  ]);

  const handleDenyChangeRequest = useCallback(() => {
    openDenyModal();
  }, [openDenyModal]);

  const handleDenyConfirm = useCallback(
    async (reason?: string) => {
      if (!apiUrl || !idToken || !galleryId || !orderId) {
        return;
      }

      setDenyLoading(true);

      try {
        await apiFetch(
          `${apiUrl}/galleries/${galleryId as string}/orders/${orderId as string}/deny-change`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reason: reason ?? undefined }),
          }
        );

        // Invalidate cache to force fresh data fetch
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        invalidateOrderCache(orderId as string);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        invalidateGalleryOrdersCache(galleryId as string);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        invalidateOrderStoreGalleryCache(galleryId as string);

        showToast(
          "success",
          "Sukces",
          "Prośba o zmiany została odrzucona. Zlecenie zostało przywrócone do poprzedniego statusu."
        );
        closeDenyModal();
        await loadOrderData();
        await loadGalleryOrders(true); // Force refresh
      } catch (err: unknown) {
        showToast("error", "Błąd", formatApiError(err) ?? "Nie udało się odrzucić prośby o zmiany");
      } finally {
        setDenyLoading(false);
      }
    },
    [
      apiUrl,
      idToken,
      galleryId,
      orderId,
      invalidateOrderCache,
      invalidateGalleryOrdersCache,
      invalidateOrderStoreGalleryCache,
      showToast,
      closeDenyModal,
      loadOrderData,
      loadGalleryOrders,
      setDenyLoading,
    ]
  );

  const handleMarkOrderPaid = useCallback(async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) {
      return;
    }
    try {
      await apiFetch(
        `${apiUrl}/galleries/${galleryId as string}/orders/${orderId as string}/mark-paid`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      // Invalidate cache to force fresh data fetch
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      invalidateOrderCache(orderId as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      invalidateGalleryOrdersCache(galleryId as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      invalidateOrderStoreGalleryCache(galleryId as string);
      showToast("success", "Sukces", "Zlecenie zostało oznaczone jako opłacone");
      // Reload order data in wrapper to update sidebar (will fetch fresh due to cache invalidation)
      await loadOrderData();
      // Trigger a custom event to notify order page to reload
      // The order page will listen to this event and reload its own order data
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("orderUpdated", { detail: { orderId } }));
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  }, [
    apiUrl,
    idToken,
    galleryId,
    orderId,
    invalidateOrderCache,
    invalidateGalleryOrdersCache,
    invalidateOrderStoreGalleryCache,
    showToast,
    loadOrderData,
  ]);

  const handleDownloadFinals = useCallback(async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) {
      return;
    }

    await downloadZip({
      apiUrl,
      galleryId: galleryId as string,
      orderId: orderId as string,
      endpoint: `${apiUrl}/galleries/${galleryId as string}/orders/${orderId as string}/final/zip`,
      filename: `order-${orderId as string}-finals.zip`,
    });
  }, [apiUrl, galleryId, orderId, downloadZip]);

  const handleSendFinalsToClient = useCallback(async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) {
      return;
    }
    try {
      await apiFetch(
        `${apiUrl}/galleries/${galleryId as string}/orders/${orderId as string}/send-final-link`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      // Invalidate cache to force fresh data fetch
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      invalidateOrderCache(orderId as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      invalidateGalleryOrdersCache(galleryId as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      invalidateOrderStoreGalleryCache(galleryId as string);
      showToast("success", "Sukces", "Link do zdjęć finalnych został wysłany do klienta");
      // Reload order data in wrapper to update sidebar (will fetch fresh due to cache invalidation)
      await loadOrderData();
      // Trigger a custom event to notify order page to reload
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("orderUpdated", { detail: { orderId } }));
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  }, [
    apiUrl,
    idToken,
    galleryId,
    orderId,
    invalidateOrderCache,
    invalidateGalleryOrdersCache,
    invalidateOrderStoreGalleryCache,
    showToast,
    loadOrderData,
  ]);

  return {
    handleApproveChangeRequest,
    handleDenyChangeRequest,
    handleDenyConfirm,
    handleMarkOrderPaid,
    handleDownloadFinals,
    handleSendFinalsToClient,
  };
};

