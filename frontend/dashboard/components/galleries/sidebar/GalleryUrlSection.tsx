import { useRouter } from "next/router";
import React, { useState } from "react";

import { useToast } from "../../../hooks/useToast";
import api, { formatApiError } from "../../../lib/api-service";
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
  const fetchGallery = useGalleryStore((state) => state.fetchGallery);
  const fetchGalleryOrders = useGalleryStore((state) => state.fetchGalleryOrders);
  const getGalleryOrders = useGalleryStore((state) => state.getGalleryOrders);
  
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

  const handleSendLink = async () => {
    if (!galleryIdStr || sendLinkLoading) {
      return;
    }

    // Check if this is a reminder (has existing orders) or initial invitation
    const galleryOrders = galleryIdStr ? getGalleryOrders(galleryIdStr, 30000) : null;
    const isReminder = galleryOrders && galleryOrders.length > 0;

    setSendLinkLoading(true);

    try {
      const response = await api.galleries.sendToClient(galleryIdStr);
      const isReminderResponse = response.isReminder ?? isReminder;

      showToast(
        "success",
        "Sukces",
        isReminderResponse
          ? "Przypomnienie z linkiem do galerii zostało wysłane do klienta"
          : "Link do galerii został wysłany do klienta"
      );

      // Only reload if it's an initial invitation (creates order), not for reminders
      if (!isReminderResponse) {
        // Reload gallery data and orders to get the newly created CLIENT_SELECTING order
        await fetchGallery(galleryIdStr, true);
        await fetchGalleryOrders(galleryIdStr, true);

        // Trigger event to reload orders if we're on the gallery detail page
        if (typeof window !== "undefined") {
          void window.dispatchEvent(
            new CustomEvent("galleryOrdersUpdated", { detail: { galleryId: galleryIdStr } })
          );
        }
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setSendLinkLoading(false);
    }
  };

  // Get gallery orders from store
  const galleryOrders = galleryIdStr ? getGalleryOrders(galleryIdStr, 30000) : null;
  
  // Check if gallery has a CLIENT_SELECTING order
  const hasClientSelectingOrder =
    galleryOrders &&
    Array.isArray(galleryOrders) &&
    galleryOrders.some((o: unknown) => {
      const orderObj = o as { deliveryStatus?: string };
      return orderObj.deliveryStatus === "CLIENT_SELECTING";
    });

  // Check if gallery has any existing orders (for determining button text)
  const hasExistingOrders = galleryOrders && Array.isArray(galleryOrders) && galleryOrders.length > 0;

  const orderDeliveryStatus = order && typeof order === "object" && "deliveryStatus" in order
    ? (order as { deliveryStatus?: string }).deliveryStatus
    : undefined;
  
  const shouldShowShareButton =
    !isLoading &&
    gallery &&
    isPaid &&
    gallery.selectionEnabled &&
    gallery.clientEmail &&
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

      {/* Share Button */}
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
