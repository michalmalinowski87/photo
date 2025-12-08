import { Home, Download, CheckCircle2, XCircle, Check, Send } from "lucide-react";
import { useRouter } from "next/router";
import React, { useCallback, useState } from "react";

import {
  useApproveChangeRequest,
  useMarkOrderPaid,
  useSendFinalLink,
} from "../../../hooks/mutations/useOrderMutations";
import { useGallery } from "../../../hooks/queries/useGalleries";
import { useOrder } from "../../../hooks/queries/useOrders";
import { useDownloadUtils } from "../../../hooks/useDownloadUtils";
import { useModal } from "../../../hooks/useModal";
import { usePublishFlow } from "../../../hooks/usePublishFlow";
import type { Order } from "../../../types";
import { useGalleryType } from "../../hocs/withGalleryType";
import Button from "../../ui/button/Button";
import { ConfirmDialog } from "../../ui/confirm/ConfirmDialog";

interface OrderActionsSectionProps {
  orderId: string;
  setPublishWizardOpen?: (open: boolean) => void; // Kept for backward compatibility, but not used (we use redirect approach)
}

export const OrderActionsSection: React.FC<OrderActionsSectionProps> = ({ orderId }) => {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  // Use React Query for data
  const { data: gallery, isLoading } = useGallery(galleryIdForQuery);
  const { data: orderData } = useOrder(galleryIdForQuery, orderId);
  const { isNonSelectionGallery } = useGalleryType();

  // Type guard: ensure order is properly typed
  const order: Order | undefined = orderData;

  // Use React Query mutations
  const approveChangeRequestMutation = useApproveChangeRequest();
  const markOrderPaidMutation = useMarkOrderPaid();
  const sendFinalsToClientMutation = useSendFinalLink();

  // Download utilities
  const { downloadFinals, downloadZip } = useDownloadUtils();

  // Modal hooks
  const { openModal: openDenyModal } = useModal("deny-change");

  // Confirmation dialog states
  const [showSendFinalsDialog, setShowSendFinalsDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  // Use mutation loading states instead of local state
  const sendFinalsLoading = sendFinalsToClientMutation.isPending;
  const markPaidLoading = markOrderPaidMutation.isPending;

  // Compute values from React Query data
  const orderHasFinals = order
    ? order.deliveryStatus === "PREPARING_DELIVERY" || order.deliveryStatus === "DELIVERED"
    : false;

  const selectedKeys = order?.selectedKeys;
  const hasSelectedKeys =
    selectedKeys && Array.isArray(selectedKeys) ? selectedKeys.length > 0 : Boolean(selectedKeys);

  const canDownloadZipValue =
    gallery?.selectionEnabled !== false &&
    order !== undefined &&
    order.deliveryStatus !== "CANCELLED" &&
    hasSelectedKeys;

  // Action handlers - must be defined before any conditional returns
  const handleApproveChangeRequest = useCallback(async () => {
    if (!galleryIdStr) {
      return;
    }
    await approveChangeRequestMutation.mutateAsync({
      galleryId: galleryIdStr,
      orderId,
    });
  }, [galleryIdStr, orderId, approveChangeRequestMutation]);

  const handleDenyChangeRequest = useCallback(() => {
    openDenyModal();
  }, [openDenyModal]);

  const handleMarkOrderPaidClick = useCallback(() => {
    setShowMarkPaidDialog(true);
  }, []);

  const handleMarkOrderPaidConfirm = useCallback(async () => {
    if (!galleryIdStr) {
      setShowMarkPaidDialog(false);
      return;
    }
    try {
      await markOrderPaidMutation.mutateAsync({
        galleryId: galleryIdStr,
        orderId,
      });
      setShowMarkPaidDialog(false);
    } catch (_err) {
      // Error handling is done in the mutation
    }
  }, [galleryIdStr, orderId, markOrderPaidMutation]);

  const handleDownloadFinals = useCallback(() => {
    if (!galleryIdStr) {
      return;
    }
    downloadFinals(galleryIdStr, orderId);
  }, [galleryIdStr, orderId, downloadFinals]);

  const handleSendFinalsToClientClick = useCallback(() => {
    setShowSendFinalsDialog(true);
  }, []);

  const handleSendFinalsToClientConfirm = useCallback(async () => {
    if (!galleryIdStr) {
      setShowSendFinalsDialog(false);
      return;
    }
    try {
      await sendFinalsToClientMutation.mutateAsync({
        galleryId: galleryIdStr,
        orderId,
      });
      setShowSendFinalsDialog(false);
    } catch (_err) {
      // Error handling is done in the mutation
    }
  }, [galleryIdStr, orderId, sendFinalsToClientMutation]);

  const handleDownloadZip = useCallback(() => {
    if (!galleryIdStr) {
      return;
    }
    downloadZip(galleryIdStr, orderId);
  }, [galleryIdStr, orderId, downloadZip]);

  const { startPublishFlow } = usePublishFlow();

  const handlePublishClick = useCallback(() => {
    if (!galleryIdStr) {
      return;
    }
    // Use centralized publish flow action
    startPublishFlow(galleryIdStr);
  }, [galleryIdStr, startPublishFlow]);

  // Defensive check: don't render until required data is loaded
  // placeholderData in useOrder hook keeps previous data during refetches to avoid flicker
  if (!orderId || order?.orderId !== orderId) {
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
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
      <div className="px-3 mb-3">
        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Zlecenie
        </div>
        <div className="text-base font-medium text-gray-900 dark:text-white">{orderId}</div>
      </div>

      <div className="space-y-2.5 px-3">
        {/* Publish Gallery Button for Non-Selection Galleries */}
        {shouldShowPublishButton && (
          <Button
            size="md"
            variant="primary"
            onClick={handlePublishClick}
            className="w-full justify-start"
            startIcon={<Home size={20} strokeWidth={2} />}
          >
            Opublikuj galerię
          </Button>
        )}

        {/* Download Selected Originals ZIP */}
        {/* Don't check isGalleryFetching - placeholderData keeps gallery data during refetches */}
        {!isLoading && gallery && gallery.selectionEnabled !== false && canDownloadZipValue && (
          <Button
            size="md"
            variant="outline"
            onClick={handleDownloadZip}
            className="w-full justify-start"
            startIcon={<Download size={20} />}
          >
            Pobierz wybrane oryginały (ZIP)
          </Button>
        )}

        {/* Download Finals - Only show if finals are uploaded */}
        {orderHasFinals && (
          <Button
            size="md"
            variant="outline"
            onClick={handleDownloadFinals}
            className="w-full justify-start"
            startIcon={<Download size={20} />}
          >
            Pobierz finały (ZIP)
          </Button>
        )}

        {/* Change Request Actions */}
        {order.deliveryStatus === "CHANGES_REQUESTED" && (
          <>
            <Button
              size="md"
              variant="primary"
              onClick={handleApproveChangeRequest}
              className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
              startIcon={<CheckCircle2 size={20} strokeWidth={2} />}
            >
              Zatwierdź prośbę o zmiany
            </Button>
            <Button
              size="md"
              variant="outline"
              onClick={handleDenyChangeRequest}
              className="w-full !text-orange-500 hover:!text-orange-600 hover:bg-orange-50 dark:!text-orange-400 dark:hover:!text-orange-300 dark:hover:bg-orange-500/10 !ring-orange-500 dark:!ring-orange-400"
              startIcon={<XCircle size={20} strokeWidth={2} />}
            >
              Odrzuć prośbę o zmiany
            </Button>
          </>
        )}

        {/* Mark Order as Paid */}
        {order.paymentStatus !== "PAID" && (
          <Button
            size="md"
            variant="outline"
            onClick={handleMarkOrderPaidClick}
            disabled={markPaidLoading}
            className="w-full justify-start"
            startIcon={<Check size={20} />}
          >
            Oznacz jako opłacone
          </Button>
        )}

        {/* Send Finals to Client - Only show if finals are uploaded */}
        {orderHasFinals && (
          <Button
            size="md"
            variant="outline"
            onClick={handleSendFinalsToClientClick}
            className="w-full justify-start"
            disabled={order.deliveryStatus === "DELIVERED" || sendFinalsLoading}
            startIcon={<Send size={20} strokeWidth={2} />}
          >
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
