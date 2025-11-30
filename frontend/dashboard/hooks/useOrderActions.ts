import { useCallback } from "react";

import { useZipDownload as useZipDownloadHook } from "../hocs/withZipDownload";
import api, { formatApiError } from "../lib/api-service";
import { useGalleryStore } from "../store/gallerySlice";
import { useOrderStore } from "../store/orderSlice";

import { useToast } from "./useToast";

interface Gallery {
  selectionEnabled?: boolean;
  [key: string]: unknown;
}

interface UseOrderActionsOptions {
  apiUrl?: string; // Deprecated - kept for backward compatibility but not used
  idToken?: string; // Deprecated - kept for backward compatibility but not used
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
  const { invalidateGalleryOrdersCache, invalidateAllGalleryCaches } = useGalleryStore();
  const { invalidateOrderCache } = useOrderStore();
  const invalidateOrderStoreGalleryCache = useOrderStore(
    (state) => state.invalidateGalleryOrdersCache
  );
  const updateOrderFields = useOrderStore((state) => state.updateOrderFields);

  const handleApproveChangeRequest = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }

    try {
      await api.orders.approveChangeRequest(galleryId as string, orderId as string);

      // Invalidate all caches to ensure fresh data on next fetch
      invalidateOrderCache(orderId as string);
      invalidateAllGalleryCaches(galleryId as string);
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
      if (!galleryId || !orderId) {
        return;
      }

      setDenyLoading(true);

      try {
        await api.orders.denyChangeRequest(galleryId as string, orderId as string, reason);

        // Invalidate all caches to ensure fresh data on next fetch
        invalidateOrderCache(orderId as string);
        invalidateAllGalleryCaches(galleryId as string);
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
    if (!galleryId || !orderId) {
      return;
    }
    try {
      const response = await api.orders.markPaid(galleryId as string, orderId as string);
      // Merge lightweight response into cached order instead of refetching
      updateOrderFields(orderId as string, {
        paymentStatus: response.paymentStatus,
        paidAt: response.paidAt,
      });
      // Invalidate all caches to ensure fresh data on next fetch
      invalidateAllGalleryCaches(galleryId as string);
      invalidateOrderStoreGalleryCache(galleryId as string);
      showToast("success", "Sukces", "Zlecenie zostało oznaczone jako opłacone");
      // Store update will trigger re-renders automatically via Zustand subscriptions
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  }, [
    galleryId,
    orderId,
    updateOrderFields,
    invalidateGalleryOrdersCache,
    invalidateOrderStoreGalleryCache,
    showToast,
  ]);

  const handleDownloadFinals = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
    await downloadZip({
      apiUrl,
      galleryId: galleryId as string,
      orderId: orderId as string,
      endpoint: `${apiUrl}/galleries/${galleryId as string}/orders/${orderId as string}/final/zip`,
      filename: `order-${orderId as string}-finals.zip`,
    });
  }, [galleryId, orderId, downloadZip]);

  const sendFinalLinkWithCleanup = useCallback(
    async (shouldCleanup: boolean) => {
      if (!galleryId || !orderId) {
        return;
      }

      try {
        const response = await api.orders.sendFinalLink(galleryId as string, orderId as string);

        // If user confirmed cleanup, call cleanup endpoint
        if (shouldCleanup) {
          try {
            await api.orders.cleanupOriginals(galleryId as string, orderId as string);
            // Invalidate all caches after cleanup (deletes originals)
            invalidateAllGalleryCaches(galleryId as string);
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

        // Merge lightweight response into cached order instead of refetching
        updateOrderFields(orderId as string, {
          deliveryStatus: "DELIVERED",
          deliveredAt: response.deliveredAt,
        });
        // Invalidate all caches to ensure fresh data on next fetch
        invalidateAllGalleryCaches(galleryId as string);
        invalidateOrderStoreGalleryCache(galleryId as string);
        // Store update will trigger re-renders automatically via Zustand subscriptions
      } catch (err) {
        showToast("error", "Błąd", formatApiError(err));
      }
    },
    [
      galleryId,
      orderId,
      updateOrderFields,
      invalidateGalleryOrdersCache,
      invalidateOrderStoreGalleryCache,
      showToast,
    ]
  );

  const handleSendFinalsToClient = useCallback(() => {
    if (!galleryId || !orderId) {
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
  }, [galleryId, orderId, gallery, openCleanupModal, sendFinalLinkWithCleanup]);

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
