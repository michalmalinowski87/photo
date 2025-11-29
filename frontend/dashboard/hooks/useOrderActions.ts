import { useCallback } from "react";

import { useZipDownload as useZipDownloadHook } from "../hocs/withZipDownload";
import { apiFetch, formatApiError } from "../lib/api";
import apiService from "../lib/api-service";
import { useGalleryStore } from "../store/gallerySlice";
import { useOrderStore } from "../store/orderSlice";

import { useToast } from "./useToast";

interface Gallery {
  selectionEnabled?: boolean;
  [key: string]: unknown;
}

interface UseOrderActionsOptions {
  apiUrl: string;
  idToken: string;
  galleryId: string | string[] | undefined;
  orderId: string | string[] | undefined;
  gallery?: Gallery | null;
  loadOrderData: () => Promise<void>;
  loadGalleryOrders: (forceRefresh?: boolean) => Promise<void>;
  openDenyModal: () => void;
  closeDenyModal: () => void;
  setDenyLoading: (loading: boolean) => void;
  openCleanupModal: () => void;
  closeCleanupModal: () => void;
}

export const useOrderActions = ({
  apiUrl,
  idToken,
  galleryId,
  orderId,
  gallery,
  loadOrderData,
  loadGalleryOrders,
  openDenyModal,
  closeDenyModal,
  setDenyLoading,
  openCleanupModal,
  closeCleanupModal,
}: UseOrderActionsOptions) => {
  const { showToast } = useToast();
  const { downloadZip } = useZipDownloadHook();
  const { invalidateGalleryOrdersCache } = useGalleryStore();
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

  const sendFinalLinkWithCleanup = useCallback(
    async (shouldCleanup: boolean) => {
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

        // If user confirmed cleanup, call cleanup endpoint
        if (shouldCleanup) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            await apiService.orders.cleanupOriginals(
              galleryId as string,
              orderId as string
            );
            showToast(
              "success",
              "Sukces",
              "Link do zdjęć finalnych został wysłany do klienta. Oryginały zostały usunięte."
            );
          } catch (cleanupErr: unknown) {
            // If cleanup fails, still show success for sending link, but warn about cleanup
            showToast(
              "success",
              "Sukces",
              "Link do zdjęć finalnych został wysłany do klienta. Nie udało się usunąć oryginałów."
            );
            console.error("Failed to cleanup originals after sending final link", cleanupErr);
          }
        } else {
          showToast("success", "Sukces", "Link do zdjęć finalnych został wysłany do klienta");
        }

        // Invalidate cache to force fresh data fetch
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        invalidateOrderCache(orderId as string);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        invalidateGalleryOrdersCache(galleryId as string);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        invalidateOrderStoreGalleryCache(galleryId as string);
        // Reload order data in wrapper to update sidebar (will fetch fresh due to cache invalidation)
        await loadOrderData();
        // Trigger a custom event to notify order page to reload
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("orderUpdated", { detail: { orderId } }));
        }
      } catch (err) {
        showToast("error", "Błąd", formatApiError(err));
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
      loadOrderData,
    ]
  );

  const handleSendFinalsToClient = useCallback(() => {
    if (!apiUrl || !idToken || !galleryId || !orderId) {
      return;
    }

    // Check if this is a selection gallery (user-selecting gallery)
    const isSelectionGallery = gallery?.selectionEnabled !== false;

    // Show cleanup modal only for selection galleries
    if (isSelectionGallery) {
      openCleanupModal();
    } else {
      // For non-selection galleries, send link directly without cleanup option
      void sendFinalLinkWithCleanup(false);
    }
  }, [apiUrl, idToken, galleryId, orderId, gallery, openCleanupModal, sendFinalLinkWithCleanup]);

  const handleCleanupConfirm = useCallback(() => {
    closeCleanupModal();
    void sendFinalLinkWithCleanup(true);
  }, [closeCleanupModal, sendFinalLinkWithCleanup]);

  const handleCleanupCancel = useCallback(() => {
    closeCleanupModal();
    void sendFinalLinkWithCleanup(false);
  }, [closeCleanupModal, sendFinalLinkWithCleanup]);

  const handleCleanupClose = useCallback(() => {
    closeCleanupModal();
    // Close icon cancels the entire action - don't send the link
  }, [closeCleanupModal]);

  return {
    handleApproveChangeRequest,
    handleDenyChangeRequest,
    handleDenyConfirm,
    handleMarkOrderPaid,
    handleDownloadFinals,
    handleSendFinalsToClient,
    handleCleanupConfirm,
    handleCleanupCancel,
    handleCleanupClose,
  };
};
