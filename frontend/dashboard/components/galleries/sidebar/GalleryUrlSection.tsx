import { Plus, Share2, Copy } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState } from "react";

import { useSendGalleryToClient } from "../../../hooks/mutations/useGalleryMutations";
import { useGallery } from "../../../hooks/queries/useGalleries";
import { useOrder, useOrders } from "../../../hooks/queries/useOrders";
import { useToast } from "../../../hooks/useToast";
import { formatApiError } from "../../../lib/api-service";
import Button from "../../ui/button/Button";

interface GalleryUrlSectionProps {
  shouldHideSecondaryElements: boolean;
}

export const GalleryUrlSection: React.FC<GalleryUrlSectionProps> = ({
  shouldHideSecondaryElements,
}) => {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
  const orderIdForQuery = orderIdStr && typeof orderIdStr === "string" ? orderIdStr : undefined;

  // Use React Query hooks
  const { data: gallery, isLoading } = useGallery(galleryIdForQuery);
  const { data: galleryOrders = [] } = useOrders(galleryIdForQuery);
  const sendGalleryLinkToClientMutation = useSendGalleryToClient();
  const { data: order } = useOrder(galleryIdForQuery, orderIdForQuery);

  const { showToast } = useToast();

  const [urlCopied, setUrlCopied] = useState(false);
  const [sendLinkLoading, setSendLinkLoading] = useState(false); // Local UI state

  // Early return: don't render if gallery doesn't exist or should hide
  // Check gallery FIRST to prevent any computation or rendering with stale data
  // This is critical to prevent flash of stale cache data after gallery deletion
  // Also check if galleryId from URL doesn't match current gallery (indicates deletion/navigation)
  const galleryIdMismatch = galleryIdStr && gallery?.galleryId !== galleryIdStr;
  if (!gallery || shouldHideSecondaryElements || galleryIdMismatch) {
    return null;
  }

  // Compute gallery URL from galleryId
  const displayGalleryUrl =
    typeof window !== "undefined" && galleryIdStr
      ? `${window.location.origin}/gallery/${galleryIdStr}`
      : "";

  const isPaid = gallery?.isPaid ?? false;
  const hasPhotos = (gallery?.originalsBytesUsed ?? 0) > 0;
  const shouldShowPublishButton = !isPaid && hasPhotos && gallery && !isLoading;

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

  const handleSendLink = async () => {
    if (!galleryIdStr || sendLinkLoading) {
      return;
    }

    setSendLinkLoading(true);
    try {
      const result = await sendGalleryLinkToClientMutation.mutateAsync(galleryIdStr);

      showToast(
        "success",
        "Sukces",
        result.isReminder
          ? "Przypomnienie z linkiem do galerii zostało wysłane do klienta"
          : "Link do galerii został wysłany do klienta"
      );
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setSendLinkLoading(false);
    }
  };

  const handlePublishClick = () => {
    if (!galleryIdStr) {
      return;
    }
    // Navigate to gallery page with publish param - GalleryLayoutWrapper will handle opening wizard
    void router.push(`/galleries/${galleryIdStr}?publish=true&galleryId=${galleryIdStr}`);
  };

  // Check if gallery has a CLIENT_SELECTING order
  const hasClientSelectingOrder = galleryOrders.some(
    (o) => o.deliveryStatus === "CLIENT_SELECTING"
  );

  // Check if gallery has any existing orders (for determining button text)
  const hasExistingOrders = galleryOrders.length > 0;

  const orderDeliveryStatus =
    order && typeof order === "object" && "deliveryStatus" in order
      ? (order as { deliveryStatus?: string }).deliveryStatus
      : undefined;

  const shouldShowShareButton =
    !isLoading &&
    gallery &&
    isPaid &&
    Boolean(gallery.selectionEnabled) &&
    typeof gallery.clientEmail === "string" &&
    gallery.clientEmail.length > 0 &&
    orderDeliveryStatus !== "PREPARING_DELIVERY" &&
    orderDeliveryStatus !== "PREPARING_FOR_DELIVERY" &&
    orderDeliveryStatus !== "DELIVERED";

  return (
    <div className="py-4 border-b border-gray-200 dark:border-gray-800">
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Adres www galerii:</div>
      <div className="p-2 bg-transparent dark:bg-transparent rounded text-xs break-all text-blue-600 dark:text-blue-400 mb-2">
        {displayGalleryUrl}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyClick}
        className={`w-full transition-all duration-500 ease-in-out ${
          urlCopied
            ? "!bg-green-500 hover:!bg-green-600 !border-green-500 hover:!border-green-600 !text-white shadow-md"
            : ""
        }`}
        startIcon={
          !urlCopied ? (
            <span className="relative inline-flex items-center justify-center w-4 h-4 flex-shrink-0">
              <Copy size={16} />
            </span>
          ) : null
        }
      >
        <span className="relative inline-flex items-center h-5 min-w-[80px]">
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

      {/* Publish Gallery Button - Show when photos uploaded but not published */}
      {shouldShowPublishButton && (
        <Button
          variant="primary"
          size="sm"
          onClick={handlePublishClick}
          className="w-full mt-2"
          startIcon={<Plus size={16} />}
        >
          Opublikuj galerię
        </Button>
      )}

      {/* Share Button - Show when published and ready to send */}
      {shouldShowShareButton && (
        <>
          {hasClientSelectingOrder ? (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="w-full mt-2"
              startIcon={<Share2 size={16} />}
            >
              Udostępniono klientowi
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSendLink}
              disabled={sendLinkLoading}
              className="w-full mt-2"
              startIcon={<Share2 size={16} />}
            >
              {sendLinkLoading
                ? "Wysyłanie..."
                : hasExistingOrders
                  ? "Wyślij link przypominający"
                  : "Udostępnij klientowi"}
            </Button>
          )}
        </>
      )}
    </div>
  );
};
