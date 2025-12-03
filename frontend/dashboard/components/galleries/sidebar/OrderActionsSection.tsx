import { Home, Download, CheckCircle2, XCircle, Check, Send } from "lucide-react";
import React, { useCallback, useState } from "react";

import { useModal } from "../../../hooks/useModal";
import { useGalleryStore } from "../../../store/gallerySlice";
import { useOrderStore } from "../../../store/orderSlice";
import { useGalleryType } from "../../hocs/withGalleryType";
import Button from "../../ui/button/Button";
import { ConfirmDialog } from "../../ui/confirm/ConfirmDialog";

interface OrderActionsSectionProps {
  orderId: string;
}

export const OrderActionsSection: React.FC<OrderActionsSectionProps> = ({ orderId }) => {
  // Subscribe directly to store
  const gallery = useGalleryStore((state) => state.currentGallery);
  const isLoading = useGalleryStore((state) => state.isLoading);
  const order = useOrderStore((state) => state.currentOrder);
  const currentOrderId = useOrderStore((state) => state.currentOrderId);
  const { isNonSelectionGallery } = useGalleryType();
  const setPublishWizardOpen = useGalleryStore((state) => state.setPublishWizardOpen);

  // Get store actions
  const approveChangeRequest = useOrderStore((state) => state.approveChangeRequest);
  const markOrderPaid = useOrderStore((state) => state.markOrderPaid);
  const downloadFinals = useOrderStore((state) => state.downloadFinals);
  const sendFinalsToClient = useOrderStore((state) => state.sendFinalsToClient);
  const downloadZip = useOrderStore((state) => state.downloadZip);
  const hasFinals = useOrderStore((state) => state.hasFinals);
  const canDownloadZip = useOrderStore((state) => state.canDownloadZip);

  // Modal hooks
  const { openModal: openDenyModal } = useModal("deny-change");

  // Confirmation dialog states
  const [showSendFinalsDialog, setShowSendFinalsDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [sendFinalsLoading, setSendFinalsLoading] = useState(false);
  const [markPaidLoading, setMarkPaidLoading] = useState(false);

  // Get computed values from store (before conditional returns)
  const orderHasFinals = hasFinals(orderId);
  const canDownloadZipValue = canDownloadZip(orderId, gallery?.selectionEnabled);
  const galleryId = gallery?.galleryId;

  // Action handlers - must be defined before any conditional returns
  const handleApproveChangeRequest = useCallback(async () => {
    if (!galleryId) {
      return;
    }
    await approveChangeRequest(galleryId, orderId);
  }, [galleryId, orderId, approveChangeRequest]);

  const handleDenyChangeRequest = useCallback(() => {
    openDenyModal();
  }, [openDenyModal]);

  const handleMarkOrderPaidClick = useCallback(() => {
    setShowMarkPaidDialog(true);
  }, []);

  const handleMarkOrderPaidConfirm = useCallback(async () => {
    if (!galleryId) {
      setShowMarkPaidDialog(false);
      return;
    }
    setMarkPaidLoading(true);
    try {
      await markOrderPaid(galleryId, orderId);
      setShowMarkPaidDialog(false);
    } catch (err) {
      // Error handling is done in the store action
    } finally {
      setMarkPaidLoading(false);
    }
  }, [galleryId, orderId, markOrderPaid]);

  const handleDownloadFinals = useCallback(async () => {
    if (!galleryId) {
      return;
    }
    await downloadFinals(galleryId, orderId);
  }, [galleryId, orderId, downloadFinals]);

  const handleSendFinalsToClientClick = useCallback(() => {
    setShowSendFinalsDialog(true);
  }, []);

  const handleSendFinalsToClientConfirm = useCallback(async () => {
    if (!galleryId) {
      setShowSendFinalsDialog(false);
      return;
    }
    setSendFinalsLoading(true);
    try {
      await sendFinalsToClient(galleryId, orderId);
      setShowSendFinalsDialog(false);
    } catch (err) {
      // Error handling is done in the store action
    } finally {
      setSendFinalsLoading(false);
    }
  }, [galleryId, orderId, sendFinalsToClient]);

  const handleDownloadZip = useCallback(async () => {
    if (!galleryId) {
      return;
    }
    await downloadZip(galleryId, orderId);
  }, [galleryId, orderId, downloadZip]);

  const handlePublishClick = useCallback(() => {
    if (gallery?.galleryId) {
      setPublishWizardOpen(true, gallery.galleryId);
    }
  }, [gallery?.galleryId, setPublishWizardOpen]);

  // Defensive check: don't render until required data is loaded
  if (!orderId || !order || currentOrderId !== orderId) {
    return null;
  }

  const isPaid = gallery?.isPaid ?? false;

  // For non-selection galleries, show publish button when status is AWAITING_FINAL_PHOTOS and gallery is not paid
  const shouldShowPublishButton =
    isNonSelectionGallery && order.deliveryStatus === "AWAITING_FINAL_PHOTOS" && !isPaid;

  // For non-selection galleries, show actions even if not paid (to show publish button)
  // For selection galleries, only show if paid
  if (!isNonSelectionGallery && !isPaid) {
    return null;
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
      <div className="px-3 mb-3">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Zlecenie
        </div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">{orderId}</div>
      </div>

      <div className="space-y-2 px-3">
        {/* Publish Gallery Button for Non-Selection Galleries */}
        {shouldShowPublishButton && (
          <Button
            size="sm"
            variant="primary"
            onClick={handlePublishClick}
            className="w-full justify-start"
          >
            <Home size={16} className="mr-2" strokeWidth={2} />
            Opublikuj galerię
          </Button>
        )}

        {/* Download Selected Originals ZIP */}
        {!isLoading && gallery && gallery.selectionEnabled !== false && canDownloadZipValue && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadZip}
            className="w-full justify-start"
          >
            <Download size={16} className="mr-2" />
            Pobierz wybrane oryginały (ZIP)
          </Button>
        )}

        {/* Download Finals - Only show if finals are uploaded */}
        {orderHasFinals && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadFinals}
            className="w-full justify-start"
          >
            <Download size={16} className="mr-2" />
            Pobierz finały
          </Button>
        )}

        {/* Change Request Actions */}
        {order.deliveryStatus === "CHANGES_REQUESTED" && (
          <>
            <Button
              size="sm"
              variant="primary"
              onClick={handleApproveChangeRequest}
              className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 size={16} className="mr-2" strokeWidth={2} />
              Zatwierdź prośbę o zmiany
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDenyChangeRequest}
              className="w-full justify-start"
            >
              <XCircle size={16} className="mr-2" strokeWidth={2} />
              Odrzuć prośbę o zmiany
            </Button>
          </>
        )}

        {/* Mark Order as Paid */}
        {order.paymentStatus !== "PAID" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkOrderPaidClick}
            disabled={markPaidLoading}
            className="w-full justify-start"
          >
            <Check size={16} className="mr-2" />
            Oznacz jako opłacone
          </Button>
        )}

        {/* Send Finals to Client - Only show if finals are uploaded */}
        {orderHasFinals && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSendFinalsToClientClick}
            className="w-full justify-start"
            disabled={order.deliveryStatus === "DELIVERED" || sendFinalsLoading}
          >
            <Send size={16} className="mr-2" strokeWidth={2} />
            {order.deliveryStatus === "DELIVERED"
              ? "Finały wysłane"
              : sendFinalsLoading
                ? "Wysyłanie..."
                : "Wyślij finały do klienta"}
          </Button>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showMarkPaidDialog}
        onClose={() => {
          if (!markPaidLoading) {
            setShowMarkPaidDialog(false);
          }
        }}
        onConfirm={handleMarkOrderPaidConfirm}
        title="Oznacz zlecenie jako opłacone"
        message={`Czy na pewno chcesz oznaczyć zlecenie #${order.orderNumber ?? orderId} jako opłacone?\n\nTa operacja jest nieodwracalna.`}
        confirmText="Oznacz jako opłacone"
        cancelText="Anuluj"
        variant="info"
        loading={markPaidLoading}
      />

      <ConfirmDialog
        isOpen={showSendFinalsDialog}
        onClose={() => {
          if (!sendFinalsLoading) {
            setShowSendFinalsDialog(false);
          }
        }}
        onConfirm={handleSendFinalsToClientConfirm}
        title="Wyślij finały do klienta"
        message={`Czy na pewno chcesz wysłać finały dla zlecenia #${order.orderNumber ?? orderId} do klienta?\n\nTa operacja jest nieodwracalna. Klient otrzyma email z linkiem do pobrania finalnych zdjęć.`}
        confirmText="Wyślij finały"
        cancelText="Anuluj"
        variant="info"
        loading={sendFinalsLoading}
      />
    </div>
  );
};
