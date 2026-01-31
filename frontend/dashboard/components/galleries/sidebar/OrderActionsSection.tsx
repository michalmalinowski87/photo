import { Home, CheckCircle2, XCircle, Check, Send } from "lucide-react";
import { useRouter } from "next/router";
import React, { useCallback, useState, useRef, useEffect } from "react";

import {
  useApproveChangeRequest,
  useMarkOrderPaid,
  useSendFinalLink,
} from "../../../hooks/mutations/useOrderMutations";
import { useGallery } from "../../../hooks/queries/useGalleries";
import { useOrder, useOrderFinalImages } from "../../../hooks/queries/useOrders";
import { useModal } from "../../../hooks/useModal";
import { usePublishFlow } from "../../../hooks/usePublishFlow";
import { formatOrderDisplay } from "../../../lib/orderDisplay";
import type { Order } from "../../../types";
import { useGalleryType } from "../../hocs/withGalleryType";
import { ZipDownloadButton } from "../../orders/ZipDownloadButton";
import Button from "../../ui/button/Button";
import { ConfirmDialog } from "../../ui/confirm/ConfirmDialog";
import { Tooltip } from "../../ui/tooltip/Tooltip";

interface OrderActionsSectionProps {
  orderId: string;
  setPublishWizardOpen?: (open: boolean) => void; // Kept for backward compatibility, but not used (we use redirect approach)
}

export const OrderActionsSection = ({ orderId }: OrderActionsSectionProps) => {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  // Use React Query for data
  const { data: gallery, isLoading, isFetching } = useGallery(galleryIdForQuery);
  const { data: orderData } = useOrder(galleryIdForQuery, orderId);
  const { isNonSelectionGallery } = useGalleryType();

  // Check if gallery has photos
  // For non-selection galleries: check final images count
  // For selection galleries: check originalsBytesUsed
  const { data: finalImages = [] } = useOrderFinalImages(galleryIdForQuery, orderId);
  const finalImagesCount = finalImages.length;
  const hasPhotos = isNonSelectionGallery
    ? finalImagesCount > 0
    : (gallery?.originalsBytesUsed ?? 0) > 0;

  // Type guard: ensure order is properly typed
  const order: Order | undefined = orderData;

  // Use React Query mutations
  const approveChangeRequestMutation = useApproveChangeRequest();
  const markOrderPaidMutation = useMarkOrderPaid();
  const sendFinalsToClientMutation = useSendFinalLink();

  // Download utilities (not used directly - ZipDownloadButton handles downloads)

  // Modal hooks
  const { openModal: openDenyModal } = useModal("deny-change");

  // Confirmation dialog states
  const [showSendFinalsDialog, setShowSendFinalsDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  // Use mutation loading states instead of local state
  const sendFinalsLoading = sendFinalsToClientMutation.isPending;
  const markPaidLoading = markOrderPaidMutation.isPending;

  // Track last known paid state to prevent flicker during refetches
  const lastKnownIsPaidRef = useRef<boolean | undefined>(undefined);

  // Update ref when gallery data changes (but not during refetches)
  useEffect(() => {
    if (!isFetching && gallery) {
      lastKnownIsPaidRef.current = typeof gallery.isPaid === "boolean" ? gallery.isPaid : false;
    }
  }, [gallery, isFetching]);

  // Compute values from React Query data
  const orderHasFinals = order
    ? order.deliveryStatus === "PREPARING_DELIVERY" || order.deliveryStatus === "DELIVERED"
    : false;

  // Check if gallery is published (never show "Send to client" button for unpublished galleries)
  const isGalleryPublished = gallery
    ? gallery.state === "PAID_ACTIVE" || gallery.paymentStatus === "PAID"
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

  // Use last known paid state during refetches to prevent flicker
  // Otherwise use current gallery state
  const effectiveIsPaid =
    isFetching && lastKnownIsPaidRef.current !== undefined
      ? lastKnownIsPaidRef.current
      : (gallery?.isPaid ?? false);
  const isPaid = effectiveIsPaid;

  // For non-selection galleries, show publish button when status is AWAITING_FINAL_PHOTOS and gallery is not paid
  // Use effectiveIsPaid to prevent flicker during refetches (e.g., status polling)
  const shouldShowPublishButton =
    isNonSelectionGallery && order.deliveryStatus === "AWAITING_FINAL_PHOTOS" && !isPaid;

  // For non-selection galleries, show actions even if not paid (to show publish button)
  // For selection galleries, only show if paid
  if (!isNonSelectionGallery && !isPaid) {
    return null;
  }

  const displayOrderNumber = formatOrderDisplay(order);

  return (
    <div className="mt-3 pt-3 border-t border-gray-400 dark:border-gray-800">
      <div className="px-3 mb-3">
        <div className="text-base font-medium text-gray-900 dark:text-white">
          Zlecenie #{displayOrderNumber}
        </div>
      </div>

      <div className="space-y-2.5 px-3">
        {/* Publish Gallery Button for Non-Selection Galleries */}
        {shouldShowPublishButton && (
          <Tooltip
            content={!hasPhotos ? "Najpierw prześlij zdjęcia" : ""}
            side="top"
            align="start"
            fullWidth
          >
            <Button
              size="md"
              variant="primary"
              onClick={handlePublishClick}
              disabled={!hasPhotos}
              className="w-full justify-start"
              startIcon={<Home size={20} strokeWidth={2} />}
            >
              Opublikuj galerię
            </Button>
          </Tooltip>
        )}

        {/* Download Selected Originals ZIP */}
        {/* Show only when deliveryStatus === 'CLIENT_APPROVED' or later, hide before approval */}
        {!isLoading &&
          !isFetching &&
          gallery &&
          gallery.selectionEnabled !== false &&
          canDownloadZipValue &&
          order &&
          (order.deliveryStatus === "CLIENT_APPROVED" ||
            order.deliveryStatus === "PREPARING_DELIVERY" ||
            order.deliveryStatus === "DELIVERED") && (
            <div className="w-full">
              <ZipDownloadButton
                galleryId={galleryIdStr ?? ""}
                orderId={orderId}
                type="original"
                deliveryStatus={order.deliveryStatus}
                className="w-full justify-start"
              />
            </div>
          )}

        {/* Download Finals - Only show if order is DELIVERED */}
        {order?.deliveryStatus === "DELIVERED" && (
          <div className="w-full">
            <ZipDownloadButton
              galleryId={galleryIdStr ?? ""}
              orderId={orderId}
              type="final"
              deliveryStatus={order.deliveryStatus}
              className="w-full justify-start"
            />
          </div>
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

        {/* Send Finals to Client - Only show if finals are uploaded AND gallery is published */}
        {orderHasFinals && isGalleryPublished && (
          <Button
            size="md"
            variant="outline"
            onClick={handleSendFinalsToClientClick}
            className="w-full justify-start"
            disabled={order.deliveryStatus === "DELIVERED" || sendFinalsLoading}
            startIcon={<Send size={20} strokeWidth={2} />}
          >
            {order.deliveryStatus === "DELIVERED"
              ? "Zdjęcia finalne wysłane"
              : sendFinalsLoading
                ? "Wysyłanie..."
                : "Wyślij zdjęcia do klienta"}
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
        message={`Czy na pewno chcesz oznaczyć zlecenie #${displayOrderNumber} jako opłacone?\n\nTa operacja jest nieodwracalna.`}
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
        title="Wyślij zdjęcia finalne do klienta"
        message={`Czy na pewno chcesz wysłać zdjęcia finalne dla zlecenia #${displayOrderNumber} do klienta?\n\nTa operacja jest nieodwracalna. Klient otrzyma email z linkiem do pobrania finalnych zdjęć.`}
        confirmText="Wyślij zdjęcia finalne"
        cancelText="Anuluj"
        variant="info"
        loading={sendFinalsLoading}
      />
    </div>
  );
};
