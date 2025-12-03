import { Plus, Share2, Copy, Check } from "lucide-react";
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
  const sendLinkLoading = useGalleryStore((state) => state.sendLinkLoading);
  const galleryUrl = useGalleryStore((state) => state.galleryUrl);
  const copyGalleryUrl = useGalleryStore((state) => state.copyGalleryUrl);
  // Subscribe to galleryOrders state (always current for the current gallery)
  const galleryOrdersState = useGalleryStore((state) => state.galleryOrders);
  // Also subscribe to cache entry to trigger re-render when cache is updated
  const galleryOrdersCacheEntry = useGalleryStore((state) =>
    galleryIdStr ? state.galleryOrdersCache[galleryIdStr] : null
  );

  const order = useOrderStore((state) => state.currentOrder);
  const { showToast } = useToast();

  const [urlCopied, setUrlCopied] = useState(false);

  // Early return: don't render if gallery doesn't exist or should hide
  // Check gallery FIRST to prevent any computation or rendering with stale data
  // This is critical to prevent flash of stale cache data after gallery deletion
  // Also check if galleryId from URL doesn't match current gallery (indicates deletion/navigation)
  const galleryIdMismatch = galleryIdStr && gallery?.galleryId !== galleryIdStr;
  if (!gallery || shouldHideSecondaryElements || galleryIdMismatch) {
    return null;
  }

  // Use galleryUrl from store, fallback to computed if not set
  const displayGalleryUrl =
    galleryUrl ||
    (typeof window !== "undefined" && galleryIdStr
      ? `${window.location.origin}/gallery/${galleryIdStr}`
      : "");

  const isPaid = gallery?.isPaid ?? false;
  const hasPhotos = (gallery?.originalsBytesUsed ?? 0) > 0;
  const shouldShowPublishButton = !isPaid && hasPhotos && gallery && !isLoading;

  // Defensive check: don't render if no gallery URL
  if (!displayGalleryUrl) {
    return null;
  }

  const handleCopyClick = () => {
    if (galleryIdStr) {
      copyGalleryUrl(galleryIdStr);
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
    }
  };

  // Get gallery orders - use cache entry if available (it's kept fresh by fetchGalleryOrders)
  // The cache is invalidated and refetched when sendGalleryLinkToClient is called, so it should be current
  // We check both the cache entry (for reactivity) and the state (as fallback)
  const galleryOrders: unknown[] | null = galleryOrdersCacheEntry
    ? (galleryOrdersCacheEntry.orders as unknown[])
    : galleryOrdersState && Array.isArray(galleryOrdersState) && galleryOrdersState.length > 0
      ? (galleryOrdersState as unknown[])
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
