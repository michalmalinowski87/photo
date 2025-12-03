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
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2"
            >
              <path
                d="M10 2L3 7V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H15C15.5304 19 16.0391 18.7893 16.4142 18.4142C16.7893 18.0391 17 17.5304 17 17V7L10 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2"
            >
              <path
                d="M10 2.5L5 7.5H8V13.5H12V7.5H15L10 2.5ZM3 15.5V17.5H17V15.5H3Z"
                fill="currentColor"
              />
            </svg>
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2"
            >
              <path
                d="M10 2.5L5 7.5H8V13.5H12V7.5H15L10 2.5ZM3 15.5V17.5H17V15.5H3Z"
                fill="currentColor"
              />
            </svg>
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2"
              >
                <path
                  d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 10L9 12L13 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Zatwierdź prośbę o zmiany
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDenyChangeRequest}
              className="w-full justify-start"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2"
              >
                <path
                  d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 7L13 13M13 7L7 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2"
            >
              <path d="M8 13L4 9L5.41 7.59L8 10.17L14.59 3.58L16 5L8 13Z" fill="currentColor" />
            </svg>
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2"
            >
              <path
                d="M2.5 5L10 10L17.5 5M2.5 15L10 20L17.5 15M2.5 10L10 15L17.5 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
