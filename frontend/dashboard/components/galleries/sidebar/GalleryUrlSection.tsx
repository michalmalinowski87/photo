import { Plus, Share2, Copy, ExternalLink } from "lucide-react";
import { useRouter } from "next/router";
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";

import { useSendGalleryToClient } from "../../../hooks/mutations/useGalleryMutations";
import { useGallery } from "../../../hooks/queries/useGalleries";
import { useOrder, useOrders, useOrderFinalImages } from "../../../hooks/queries/useOrders";
import { usePublishFlow } from "../../../hooks/usePublishFlow";
import { useToast } from "../../../hooks/useToast";
import { formatApiError } from "../../../lib/api-service";
import { buildTenantGalleryUrl } from "../../../lib/gallery-url";
import Button from "../../ui/button/Button";
import { Tooltip } from "../../ui/tooltip/Tooltip";

interface GalleryUrlSectionProps {
  shouldHideSecondaryElements: boolean;
}

export const GalleryUrlSection = ({ shouldHideSecondaryElements }: GalleryUrlSectionProps) => {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
  const orderIdForQuery = orderIdStr && typeof orderIdStr === "string" ? orderIdStr : undefined;

  // Use React Query hooks (must be called before any early returns)
  const { data: gallery, isLoading, isFetching } = useGallery(galleryIdForQuery);
  const {
    data: galleryOrders = [],
    isLoading: isLoadingOrders,
    isFetching: isFetchingOrders,
  } = useOrders(galleryIdForQuery);
  const sendGalleryLinkToClientMutation = useSendGalleryToClient();
  const { data: order } = useOrder(galleryIdForQuery, orderIdForQuery);
  const { startPublishFlow } = usePublishFlow();

  const { showToast } = useToast();

  const [urlCopied, setUrlCopied] = useState(false);

  // Track last known paid state to prevent flicker during refetches
  const lastKnownIsPaidRef = useRef<boolean>(false);

  // Track last known hasClientSelectingOrder state to prevent button disappearing during refetches
  const lastKnownHasClientSelectingOrderRef = useRef<boolean>(false);

  // Track if we just sent to client to maintain processing state during refetch
  const isProcessingAfterSendRef = useRef<boolean>(false);

  // Track if send link request is in flight to prevent concurrent calls
  const isSendingRef = useRef(false);

  // Update ref when gallery data changes (but not during refetches)
  useEffect(() => {
    if (!isFetching && gallery) {
      lastKnownIsPaidRef.current = typeof gallery.isPaid === "boolean" ? gallery.isPaid : false;
    }
  }, [gallery, isFetching]);

  // Update ref when orders data changes (but not during refetches)
  useEffect(() => {
    if (!isFetchingOrders && galleryOrders.length >= 0) {
      const hasClientSelecting = galleryOrders.some((o) => o.deliveryStatus === "CLIENT_SELECTING");
      lastKnownHasClientSelectingOrderRef.current = hasClientSelecting;
      // Only clear processing flag when we have confirmed CLIENT_SELECTING order exists
      // This ensures smooth transition from processing -> sent state without showing "send" button again
      if (isProcessingAfterSendRef.current && hasClientSelecting) {
        isProcessingAfterSendRef.current = false;
      }
    }
  }, [galleryOrders, isFetchingOrders]);
  // Use mutation loading state instead of local state
  const sendLinkLoading = sendGalleryLinkToClientMutation.isPending;

  // For non-selective galleries, check if first order has final images
  // For selective galleries, check if original photos are uploaded
  const isNonSelectionGallery = gallery?.selectionEnabled === false;
  const effectiveOrderIdForFinalImages = useMemo(() => {
    if (orderIdForQuery) {
      return orderIdForQuery;
    }
    // For non-selective galleries, use first order if available
    if (isNonSelectionGallery && galleryOrders.length > 0) {
      return galleryOrders[0]?.orderId;
    }
    return undefined;
  }, [orderIdForQuery, isNonSelectionGallery, galleryOrders]);

  const { data: finalImages = [] } = useOrderFinalImages(
    galleryIdForQuery,
    effectiveOrderIdForFinalImages
  );
  const finalImagesCount = finalImages.length;

  // Move all hooks before any conditional returns to comply with Rules of Hooks
  const handleSendLink = useCallback(async () => {
    // Atomic check-and-set: if already sending, return immediately
    if (
      !galleryIdStr ||
      isSendingRef.current ||
      sendLinkLoading ||
      sendGalleryLinkToClientMutation.isPending
    ) {
      return;
    }

    // Set flag immediately to prevent race conditions (atomic operation)
    isSendingRef.current = true;

    try {
      const result = await sendGalleryLinkToClientMutation.mutateAsync(galleryIdStr);

      // Mark that we're processing after send - this will be cleared when CLIENT_SELECTING order is confirmed
      isProcessingAfterSendRef.current = true;

      showToast(
        "success",
        "Sukces",
        result.isReminder
          ? "Przypomnienie z linkiem do galerii zostało wysłane do klienta"
          : "Link do galerii został wysłany do klienta"
      );
    } catch (err) {
      // Only show error if it's not the "already in progress" error
      const errorMessage = formatApiError(err);
      if (!errorMessage.includes("already in progress")) {
        showToast("error", "Błąd", errorMessage);
      }
    } finally {
      // Reset flag after request completes (success or error)
      isSendingRef.current = false;
    }
  }, [galleryIdStr, sendLinkLoading, sendGalleryLinkToClientMutation, showToast]);

  const handlePublishClick = useCallback(() => {
    if (!galleryIdStr) {
      return;
    }
    // Use centralized publish flow action
    startPublishFlow(galleryIdStr);
  }, [galleryIdStr, startPublishFlow]);

  // Compute values needed for button state (before early returns)
  const currentHasClientSelectingOrder = galleryOrders.some(
    (o) => o.deliveryStatus === "CLIENT_SELECTING"
  );
  const hasClientSelectingOrder =
    isFetchingOrders && lastKnownHasClientSelectingOrderRef.current !== undefined
      ? lastKnownHasClientSelectingOrderRef.current
      : currentHasClientSelectingOrder;
  const isProcessingAfterSend = sendLinkLoading || isProcessingAfterSendRef.current;
  const hasExistingOrders = galleryOrders.length > 0;
  const orderDeliveryStatus =
    order && typeof order === "object" && "deliveryStatus" in order
      ? (order as { deliveryStatus?: string }).deliveryStatus
      : undefined;
  const shouldShowShareButtonComputed =
    !isLoading &&
    (!isFetching || isProcessingAfterSend) &&
    !isLoadingOrders &&
    gallery &&
    typeof gallery.isPaid === "boolean" &&
    gallery.isPaid &&
    Boolean(gallery.selectionEnabled) &&
    typeof gallery.clientEmail === "string" &&
    gallery.clientEmail.length > 0 &&
    orderDeliveryStatus !== "PREPARING_DELIVERY" &&
    orderDeliveryStatus !== "DELIVERED";

  // Early return: don't render if gallery doesn't exist or should hide
  // Check gallery FIRST to prevent any computation or rendering with stale data
  // This is critical to prevent flash of stale cache data after gallery deletion
  // Also check if galleryId from URL doesn't match current gallery (indicates deletion/navigation)
  const galleryIdMismatch = galleryIdStr && gallery?.galleryId !== galleryIdStr;
  if (!gallery || shouldHideSecondaryElements || galleryIdMismatch) {
    return null;
  }

  // Compute gallery URL from galleryId using tenant URL builder
  const displayGalleryUrl =
    galleryIdStr && typeof galleryIdStr === "string" && gallery
      ? buildTenantGalleryUrl(gallery)
      : "";

  // Use last known paid state during refetches to prevent flicker
  // Otherwise use current gallery state
  const effectiveIsPaid =
    isFetching && lastKnownIsPaidRef.current !== undefined
      ? lastKnownIsPaidRef.current
      : (gallery?.isPaid ?? false);
  const isPaid = effectiveIsPaid;

  // For selective galleries: check original photos
  // For non-selective galleries: check final images
  const hasPhotos = isNonSelectionGallery
    ? finalImagesCount > 0
    : (gallery?.originalsBytesUsed ?? 0) > 0;

  // Always show publish button when gallery is not paid (regardless of photos)
  // But disable it when there are no photos
  // Use effectiveIsPaid to prevent flicker during refetches (e.g., status polling)
  const shouldShowPublishButton = !isPaid && gallery && !isLoading;

  // Defensive check: don't render if no gallery URL
  if (!displayGalleryUrl) {
    return null;
  }

  const handleCopyClick = () => {
    if (displayGalleryUrl && typeof window !== "undefined") {
      void navigator.clipboard.writeText(displayGalleryUrl).catch(() => {
        // Ignore clipboard errors
      });
      setUrlCopied(true);
      setTimeout(() => {
        setUrlCopied(false);
      }, 2500);
    }
  };

  // Check if gallery has a CLIENT_SELECTING order
  // Use last known state during refetches to prevent button disappearing
  // (already computed above)

  // Show share button when conditions are met
  // Don't hide during refetches if we're in a processing state (mutation pending or refetching after send)
  const shouldShowShareButton = shouldShowShareButtonComputed;

  return (
    <div className="py-3 border-b border-gray-400 dark:border-gray-800">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1.5">Adres www galerii:</div>
      <a
        href={displayGalleryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-2.5 bg-transparent dark:bg-transparent rounded text-sm break-all text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-2.5 transition-colors no-underline"
      >
        <span className="flex-1">{displayGalleryUrl}</span>
        <ExternalLink size={16} className="flex-shrink-0" />
      </a>
      <Button
        variant="outline"
        size="md"
        onClick={handleCopyClick}
        className={`w-full transition-all duration-500 ease-in-out ${
          urlCopied
            ? "!bg-green-500 hover:!bg-green-600 !border-green-500 hover:!border-green-600 !text-white shadow-md"
            : ""
        }`}
        startIcon={
          !urlCopied ? (
            <span className="relative inline-flex items-center justify-center w-5 h-5 flex-shrink-0">
              <Copy size={20} />
            </span>
          ) : null
        }
      >
        <span className="relative inline-flex items-center h-5 min-w-[60px]">
          <span
            className={`absolute left-1/2 -translate-x-1/2 transition-all duration-500 ease-in-out whitespace-nowrap ${
              urlCopied ? "opacity-0 scale-90" : "opacity-100 scale-100"
            }`}
          >
            Kopiuj URL
          </span>
          <span
            className={`absolute left-1/2 -translate-x-1/2 transition-all duration-500 ease-in-out whitespace-nowrap ${
              urlCopied ? "opacity-100 scale-100" : "opacity-0 scale-90"
            }`}
          >
            Skopiowano URL
          </span>
        </span>
      </Button>

      {/* Publish Gallery Button - Show when not paid, disabled if no photos */}
      {shouldShowPublishButton &&
        (!hasPhotos ? (
          <Tooltip content="Najpierw prześlij zdjęcia" side="top" align="center" fullWidth>
            <Button
              variant="primary"
              size="md"
              onClick={handlePublishClick}
              disabled={!hasPhotos}
              className="w-full mt-2.5"
              startIcon={<Plus size={20} />}
            >
              Opublikuj galerię
            </Button>
          </Tooltip>
        ) : (
          <Button
            variant="primary"
            size="md"
            onClick={handlePublishClick}
            disabled={!hasPhotos}
            className="w-full mt-2.5"
            startIcon={<Plus size={20} />}
          >
            Opublikuj galerię
          </Button>
        ))}

      {/* Share Button - Show when published and ready to send */}
      {shouldShowShareButton && (
        <>
          {hasClientSelectingOrder || sendLinkLoading || isProcessingAfterSendRef.current ? (
            <Button
              variant="outline"
              size="md"
              disabled
              className="w-full mt-2.5 transition-opacity duration-300"
              startIcon={<Share2 size={20} />}
            >
              {sendLinkLoading ? "Wysyłanie..." : "Udostępniono klientowi"}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={handleSendLink}
              disabled={sendLinkLoading}
              className="w-full mt-2.5 transition-opacity duration-300"
              startIcon={<Share2 size={20} />}
            >
              {hasExistingOrders ? "Wyślij link przypominający" : "Udostępnij klientowi"}
            </Button>
          )}
        </>
      )}
    </div>
  );
};
