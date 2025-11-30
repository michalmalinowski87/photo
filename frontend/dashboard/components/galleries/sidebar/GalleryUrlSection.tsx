import { useRouter } from "next/router";
import React, { useState } from "react";

import { useToast } from "../../../hooks/useToast";
import { formatApiError } from "../../../lib/api-service";
import { useGalleryStore } from "../../../store/gallerySlice";
import { useOrderStore } from "../../../store/orderSlice";
import Button from "../../ui/button/Button";

interface GalleryUrlSectionProps {
  shouldHideSecondaryElements: boolean;
}

export const GalleryUrlSection: React.FC<GalleryUrlSectionProps> = ({
  shouldHideSecondaryElements,
}) => {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;

  const gallery = useGalleryStore((state) => state.currentGallery);
  const isLoading = useGalleryStore((state) => state.isLoading);
  const setPublishWizardOpen = useGalleryStore((state) => state.setPublishWizardOpen);
  const sendGalleryLinkToClient = useGalleryStore((state) => state.sendGalleryLinkToClient);
  // Subscribe to galleryOrdersCache to trigger re-render when orders are updated
  const galleryOrdersCacheEntry = useGalleryStore((state) =>
    galleryIdStr ? state.galleryOrdersCache[galleryIdStr] : null
  );

  const order = useOrderStore((state) => state.currentOrder);
  const { showToast } = useToast();

  const [urlCopied, setUrlCopied] = useState(false);
  const [sendLinkLoading, setSendLinkLoading] = useState(false);

  // Compute gallery URL from galleryId
  const galleryUrl =
    typeof window !== "undefined" && galleryIdStr
      ? `${window.location.origin}/gallery/${galleryIdStr}`
      : "";

  const isPaid = gallery?.isPaid ?? false;
  const hasPhotos = (gallery?.originalsBytesUsed ?? 0) > 0;
  const shouldShowPublishButton = !isPaid && hasPhotos && gallery && !isLoading;

  if (!galleryUrl || shouldHideSecondaryElements) {
    return null;
  }

  const handleCopyClick = () => {
    if (typeof window !== "undefined" && galleryUrl) {
      void navigator.clipboard.writeText(galleryUrl).catch(() => {
        // Ignore clipboard errors
      });
      setUrlCopied(true);
      setTimeout(() => {
        setUrlCopied(false);
      }, 2500);
    }
  };

  const handlePublishClick = () => {
    if (galleryIdStr) {
      // Open publish wizard directly via Zustand store
      setPublishWizardOpen(true, galleryIdStr);
    }
  };

  const handleSendLink = async () => {
    if (!galleryIdStr || sendLinkLoading) {
      return;
    }

    setSendLinkLoading(true);

    try {
      const result = await sendGalleryLinkToClient(galleryIdStr);

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

  // Get gallery orders from store (use cache entry directly to trigger re-render)
  const galleryOrders: unknown[] | null = galleryOrdersCacheEntry
    ? Date.now() - galleryOrdersCacheEntry.timestamp < 30000
      ? (galleryOrdersCacheEntry.orders as unknown[])
      : null
    : null;

  // Check if gallery has a CLIENT_SELECTING order
  const hasClientSelectingOrder =
    galleryOrders &&
    Array.isArray(galleryOrders) &&
    galleryOrders.some((o: unknown) => {
      const orderObj = o as { deliveryStatus?: string };
      return orderObj.deliveryStatus === "CLIENT_SELECTING";
    });

  // Check if gallery has any existing orders (for determining button text)
  const hasExistingOrders =
    galleryOrders && Array.isArray(galleryOrders) && galleryOrders.length > 0;

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
      <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs break-all text-blue-600 dark:text-blue-400 mb-2">
        {galleryUrl}
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
      >
        <span className="relative inline-block min-w-[120px] h-5">
          <span
            className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${
              urlCopied ? "opacity-0 scale-90" : "opacity-100 scale-100"
            }`}
          >
            Kopiuj URL
          </span>
          <span
            className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${
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
          startIcon={
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8 2V14M2 8H14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          }
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
              startIcon={
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M8 2V14M2 8H14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              }
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
              startIcon={
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M8 2V14M2 8H14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              }
            >
              {sendLinkLoading
                ? "Wysyłanie..."
                : hasExistingOrders
                  ? "Wyślij link do galerii"
                  : "Udostępnij klientowi"}
            </Button>
          )}
        </>
      )}
    </div>
  );
};
