import { AlertTriangle } from "lucide-react";
import React, { useState, useEffect } from "react";

import { useBusinessInfo } from "../../../hooks/queries/useAuth";
import { useGallery } from "../../../hooks/queries/useGalleries";
import { useOrders } from "../../../hooks/queries/useOrders";
import { shouldShowWatermarkWarningForGallery } from "../../../lib/watermark-warning";
import type { Gallery } from "../../../types";
import { Modal } from "../../ui/modal";

import { LoginPersonalizationOverlay } from "./LoginPersonalizationOverlay";
import { WatermarkEditorOverlay } from "./WatermarkEditorOverlay";

interface WatermarkPersonalizationOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  gallery: Gallery | null | undefined;
  coverPhotoUrl?: string;
}

export const WatermarkPersonalizationOverlay: React.FC<WatermarkPersonalizationOverlayProps> = ({
  isOpen,
  onClose,
  galleryId,
  gallery,
  coverPhotoUrl,
}) => {
  const { data: businessInfo } = useBusinessInfo();
  const { data: currentGallery } = useGallery(galleryId);
  const { data: orders = [] } = useOrders(galleryId);
  const effectiveGallery = currentGallery ?? gallery;
  const hasDeliveredOrPreparingDelivery = orders.some(
    (o) => o.deliveryStatus === "DELIVERED" || o.deliveryStatus === "PREPARING_DELIVERY"
  );
  const showWatermarkWarning =
    effectiveGallery !== undefined &&
    effectiveGallery !== null &&
    businessInfo !== undefined &&
    businessInfo !== null &&
    !hasDeliveredOrPreparingDelivery &&
    shouldShowWatermarkWarningForGallery(effectiveGallery, businessInfo);
  const effectiveCoverPhotoUrl =
    coverPhotoUrl ??
    (effectiveGallery?.coverPhotoUrl && typeof effectiveGallery.coverPhotoUrl === "string"
      ? effectiveGallery.coverPhotoUrl
      : "");

  const [activeOption, setActiveOption] = useState<"login" | "watermark" | null>(null);

  // Reset active option when overlay closes
  useEffect(() => {
    if (!isOpen) {
      setActiveOption(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    setActiveOption(null);
    onClose();
  };

  if (activeOption === "login") {
    return (
      <LoginPersonalizationOverlay
        isOpen={true}
        onClose={handleClose}
        galleryId={galleryId}
        coverPhotoUrl={effectiveCoverPhotoUrl}
      />
    );
  }

  if (activeOption === "watermark") {
    return (
      <WatermarkEditorOverlay
        isOpen={true}
        onClose={handleClose}
        galleryId={galleryId}
        gallery={effectiveGallery}
      />
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      className="max-w-4xl max-h-[90vh] flex flex-col"
      showCloseButton={true}
      closeOnClickOutside={false}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Personalizacja galerii
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mb-8">
            <p className="text-base text-gray-600 dark:text-gray-400">
              Wybierz, co chcesz spersonalizować:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Login Template Option */}
            <button
              onClick={() => setActiveOption("login")}
              className="relative p-10 md:p-12 rounded-2xl border-2 border-gray-400 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-photographer-accent dark:hover:border-photographer-accent transition-all duration-300 active:scale-[0.98]"
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center bg-photographer-muted dark:bg-gray-700">
                  <svg
                    className="w-10 h-10 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                    Szablon logowania
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Wybierz układ strony logowania i dostosuj pozycję zdjęcia okładkowego
                  </div>
                </div>
              </div>
            </button>

            {/* Watermark Option */}
            <button
              onClick={() => setActiveOption("watermark")}
              className="relative p-10 md:p-12 rounded-2xl border-2 border-gray-400 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-photographer-accent dark:hover:border-photographer-accent transition-all duration-300 active:scale-[0.98]"
            >
              {showWatermarkWarning && (
                <div
                  className="absolute top-2 right-2"
                  title="Znak wodny nie został ustawiony"
                  aria-label="Znak wodny nie został ustawiony"
                >
                  <AlertTriangle size={20} className="text-orange-500 dark:text-orange-400" />
                </div>
              )}
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center bg-photographer-muted dark:bg-gray-700">
                  <svg
                    className="w-10 h-10 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                    Znak wodny
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Dodaj znak wodny, aby zabezpieczyć zdjęcia przed nieautoryzowanym użyciem
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Anuluj
          </button>
        </div>
      </div>
    </Modal>
  );
};
