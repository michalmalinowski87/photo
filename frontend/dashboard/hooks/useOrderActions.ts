import { useCallback } from "react";

import { useZipDownload as useZipDownloadHook } from "../hocs/withZipDownload";
import { formatApiError } from "../lib/api-service";

import {
  useApproveChangeRequest,
  useDenyChangeRequest,
  useMarkOrderPaid,
  useSendFinalLink,
} from "./mutations/useOrderMutations";
import { useToast } from "./useToast";

interface Gallery {
  selectionEnabled?: boolean;
  [key: string]: unknown;
}

interface UseOrderActionsOptions {
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

  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;

  const approveChangeRequestMutation = useApproveChangeRequest();
  const denyChangeRequestMutation = useDenyChangeRequest();
  const markOrderPaidMutation = useMarkOrderPaid();
  const sendFinalLinkMutation = useSendFinalLink();

  const handleApproveChangeRequest = useCallback(async () => {
    if (!galleryIdStr || !orderIdStr) {
      return;
    }

    try {
      await approveChangeRequestMutation.mutateAsync({
        galleryId: galleryIdStr,
        orderId: orderIdStr,
      });

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
  }, [
    galleryIdStr,
    orderIdStr,
    approveChangeRequestMutation,
    showToast,
    loadOrderData,
    loadGalleryOrders,
  ]);

  const handleDenyChangeRequest = useCallback(() => {
    openDenyModal();
  }, [openDenyModal]);

  const handleDenyConfirm = useCallback(
    async (reason?: string, preventFutureChangeRequests?: boolean) => {
      if (!galleryIdStr || !orderIdStr) {
        return;
      }

      setDenyLoading(true);

      try {
        await denyChangeRequestMutation.mutateAsync({
          galleryId: galleryIdStr,
          orderId: orderIdStr,
          reason,
          preventFutureChangeRequests,
        });

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
      galleryIdStr,
      orderIdStr,
      denyChangeRequestMutation,
      showToast,
      closeDenyModal,
      loadOrderData,
      loadGalleryOrders,
      setDenyLoading,
    ]
  );

  const handleMarkOrderPaid = useCallback(async () => {
    if (!galleryIdStr || !orderIdStr) {
      return;
    }
    try {
      await markOrderPaidMutation.mutateAsync({
        galleryId: galleryIdStr,
        orderId: orderIdStr,
      });

      showToast("success", "Sukces", "Zlecenie zostało oznaczone jako opłacone");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  }, [galleryIdStr, orderIdStr, markOrderPaidMutation, showToast]);

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
    if (!galleryIdStr || !orderIdStr) {
      return;
    }

    try {
      await sendFinalLinkMutation.mutateAsync({
        galleryId: galleryIdStr,
        orderId: orderIdStr,
      });

      showToast("success", "Sukces", "Link do zdjęć finalnych został wysłany do klienta");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  }, [galleryIdStr, orderIdStr, sendFinalLinkMutation, showToast]);

  return {
    handleApproveChangeRequest,
    handleDenyChangeRequest,
    handleDenyConfirm,
    handleMarkOrderPaid,
    handleDownloadFinals,
    handleSendFinalsToClient,
  };
};
