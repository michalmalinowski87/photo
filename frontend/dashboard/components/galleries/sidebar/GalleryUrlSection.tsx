import React, { useState } from "react";

import Button from "../../ui/button/Button";

interface Gallery {
  selectionEnabled?: boolean;
  clientEmail?: string;
  orders?: unknown[];
  [key: string]: unknown;
}

interface Order {
  deliveryStatus?: string;
  [key: string]: unknown;
}

interface GalleryUrlSectionProps {
  galleryUrl: string;
  gallery: Gallery | null;
  galleryLoading: boolean;
  isPaid: boolean;
  order?: Order;
  sendLinkLoading: boolean;
  shouldHideSecondaryElements: boolean;
  onCopyUrl: () => void;
  onSendLink: () => void;
}

export const GalleryUrlSection: React.FC<GalleryUrlSectionProps> = ({
  galleryUrl,
  gallery,
  galleryLoading,
  isPaid,
  order,
  sendLinkLoading,
  shouldHideSecondaryElements,
  onCopyUrl,
  onSendLink,
}) => {
  const [urlCopied, setUrlCopied] = useState(false);

  if (!galleryUrl || shouldHideSecondaryElements) {
    return null;
  }

  const handleCopyClick = () => {
    onCopyUrl();
    setUrlCopied(true);
    setTimeout(() => {
      setUrlCopied(false);
    }, 2500);
  };

  // Check if gallery has a CLIENT_SELECTING order
  const hasClientSelectingOrder =
    gallery?.orders &&
    Array.isArray(gallery.orders) &&
    gallery.orders.some((o: unknown) => {
      const orderObj = o as { deliveryStatus?: string };
      return orderObj.deliveryStatus === "CLIENT_SELECTING";
    });

  // Check if gallery has any existing orders (for determining button text)
  const hasExistingOrders =
    gallery?.orders && Array.isArray(gallery.orders) && gallery.orders.length > 0;

  const shouldShowShareButton =
    !galleryLoading &&
    gallery &&
    isPaid &&
    gallery.selectionEnabled &&
    gallery.clientEmail &&
    order?.deliveryStatus !== "PREPARING_DELIVERY" &&
    order?.deliveryStatus !== "PREPARING_FOR_DELIVERY" &&
    order?.deliveryStatus !== "DELIVERED";

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
            <Button variant="outline" size="sm" disabled className="w-full mt-2" startIcon={
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
            }>
              Udostępniono klientowi
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={onSendLink}
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

