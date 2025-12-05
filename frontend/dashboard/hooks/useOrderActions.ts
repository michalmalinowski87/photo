import { useCallback } from "react";

import { useZipDownload as useZipDownloadHook } from "../hocs/withZipDownload";
import api, { formatApiError } from "../lib/api-service";
import { useOrderStore } from "../store";

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
  loadGalleryOrders: () => Promise<void>;
  openDenyModal: () => void;
  closeDenyModal: () => void;
  setDenyLoading: (loading: boolean) => void;
}

export const useOrderActions = ({
  apiUrl: _apiUrl,
  idToken: _idToken,
  galleryId,
  orderId,
  gallery: _gallery,
  loadOrderData,
  loadGalleryOrders,
  openDenyModal,
  closeDenyModal,
  setDenyLoading,
}: UseOrderActionsOptions) => {
  const { showToast } = useToast();
  const { downloadZip } = useZipDownloadHook();
  const { setCurrentOrder } = useOrderStore();

  const handleApproveChangeRequest = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }

    try {
      await api.orders.approveChangeRequest(galleryId as string, orderId as string);

      showToast(
        "success",
        "Sukces",
        "Prośba o zmiany została zatwierdzona. Klient może teraz modyfikować wybór."
      );
      await loadOrderData();
      await loadGalleryOrders();
    } catch (err) {
      showToast(
        "error",
        "Błąd",
        formatApiError(err) ?? "Nie udało się zatwierdzić prośby o zmiany"
      );
    }
  }, [galleryId, orderId, showToast, loadOrderData, loadGalleryOrders]);

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

        showToast(
          "success",
          "Sukces",
          "Prośba o zmiany została odrzucona. Zlecenie zostało przywrócone do poprzedniego statusu."
        );
        closeDenyModal();
        await loadOrderData();
        await loadGalleryOrders();
      } catch (err: unknown) {
        showToast("error", "Błąd", formatApiError(err) ?? "Nie udało się odrzucić prośby o zmiany");
      } finally {
        setDenyLoading(false);
      }
    },
    [
      galleryId,
      orderId,
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

      // Update current order if it matches
      const currentOrder = useOrderStore.getState().currentOrder;
      if (currentOrder?.orderId === orderId) {
        setCurrentOrder({
          ...currentOrder,
          paymentStatus: response.paymentStatus,
          paidAt: response.paidAt,
        });
      }

      showToast("success", "Sukces", "Zlecenie zostało oznaczone jako opłacone");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  }, [galleryId, orderId, setCurrentOrder, showToast]);

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

  const handleSendFinalsToClient = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }

    try {
      const response = await api.orders.sendFinalLink(galleryId as string, orderId as string);

      showToast("success", "Sukces", "Link do zdjęć finalnych został wysłany do klienta");

      // Update current order if it matches
      const currentOrder = useOrderStore.getState().currentOrder;
      if (currentOrder?.orderId === orderId) {
        setCurrentOrder({
          ...currentOrder,
          deliveryStatus: "DELIVERED",
          deliveredAt: response.deliveredAt,
        });
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  }, [galleryId, orderId, setCurrentOrder, showToast]);

  return {
    handleApproveChangeRequest,
    handleDenyChangeRequest,
    handleDenyConfirm,
    handleMarkOrderPaid,
    handleDownloadFinals,
    handleSendFinalsToClient,
  };
};
