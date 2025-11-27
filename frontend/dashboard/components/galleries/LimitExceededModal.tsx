import React, { useState } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { formatPrice } from "../../lib/format-price";
import Button from "../ui/button/Button";

interface LimitExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  uploadedSizeBytes: number;
  originalsLimitBytes: number;
  excessBytes: number;
  nextTierPlan?: string;
  nextTierPriceCents?: number;
  nextTierLimitBytes?: number;
  isSelectionGallery?: boolean;
  onUpgrade?: () => void;
  onCancel?: () => void;
}

export const LimitExceededModal: React.FC<LimitExceededModalProps> = ({
  isOpen,
  onClose,
  galleryId,
  uploadedSizeBytes,
  originalsLimitBytes,
  excessBytes,
  nextTierPlan,
  nextTierPriceCents,
  nextTierLimitBytes,
  isSelectionGallery,
  onUpgrade,
  onCancel,
}) => {
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) {
    return null;
  }

  // formatPrice is now imported from format-price utility

  const handleUpgrade = async () => {
    if (!nextTierPlan || !nextTierPriceCents || !nextTierLimitBytes) {
      showToast(
        "error",
        "Błąd",
        "Nie można zaktualizować planu. Brak informacji o następnym planie."
      );
      return;
    }

    setIsProcessing(true);
    try {
      // Check if gallery is already paid - if so, use upgrade endpoint (pay difference only)
      // If not paid, use regular pay endpoint
      let paymentResult;
      try {
        const gallery = await api.galleries.get(galleryId);
        const isPaid =
          gallery.isPaid !== false &&
          (gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE");

        if (isPaid) {
          // Gallery is paid - use upgrade endpoint (pay difference only)
          paymentResult = await api.galleries.upgradePlan(galleryId, {
            plan: nextTierPlan,
          });
        } else {
          // Gallery not paid - update plan and pay full amount
          await api.galleries.update(galleryId, {
            plan: nextTierPlan,
            priceCents: nextTierPriceCents,
            originalsLimitBytes: nextTierLimitBytes,
            finalsLimitBytes: nextTierLimitBytes,
          });
          paymentResult = await api.galleries.pay(galleryId, {});
        }
      } catch (_galleryError: unknown) {
        // If we can't determine payment status, try upgrade first, fall back to pay
        try {
          paymentResult = await api.galleries.upgradePlan(galleryId, {
            plan: nextTierPlan,
          });
        } catch (_upgradeError) {
          // Fall back to regular payment flow
          await api.galleries.update(galleryId, {
            plan: nextTierPlan,
            priceCents: nextTierPriceCents,
            originalsLimitBytes: nextTierLimitBytes,
            finalsLimitBytes: nextTierLimitBytes,
          });
          paymentResult = await api.galleries.pay(galleryId, {});
        }
      }

      if (paymentResult.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = paymentResult.checkoutUrl;
      } else if (paymentResult.paid) {
        // Already paid or paid via wallet
        showToast("success", "Sukces", "Plan został zaktualizowany i opłacony!");
        onUpgrade?.();
        onClose();
      } else {
        showToast("error", "Błąd", "Nie udało się przetworzyć płatności za nowy plan.");
      }
    } catch (error) {
      showToast("error", "Błąd", formatApiError(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    // TODO: Implement file removal
    // This would need to delete the uploaded files from S3
    // For now, just close the modal
    onCancel?.();
    onClose();
  };

  const usedMB = (uploadedSizeBytes / (1024 * 1024)).toFixed(2);
  const limitMB = (originalsLimitBytes / (1024 * 1024)).toFixed(2);
  const excessMB = (excessBytes / (1024 * 1024)).toFixed(2);
  const nextTierGB = nextTierLimitBytes
    ? (nextTierLimitBytes / (1024 * 1024 * 1024)).toFixed(1)
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            Przekroczono limit miejsca w galerii
          </h2>

          <div className="mb-6 space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-gray-700 mb-2">
                <strong>Użyte miejsce:</strong> {usedMB} MB / {limitMB} MB
              </p>
              <p className="text-sm text-red-600 font-semibold">
                <strong>Nadmiar:</strong> {excessMB} MB
              </p>
            </div>

            {nextTierPlan && nextTierPriceCents && nextTierLimitBytes && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-2">Zaktualizuj plan</h3>
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Następny plan:</strong> {nextTierPlan}
                </p>
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Limit:</strong> {nextTierGB} GB
                </p>
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Cena:</strong> {formatPrice(nextTierPriceCents)}
                  {!isSelectionGallery && <span className="text-green-600 ml-1">(zniżka 20%)</span>}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="secondary" onClick={handleCancel} disabled={isProcessing}>
              Anuluj i usuń pliki
            </Button>
            {nextTierPlan && (
              <Button variant="primary" onClick={handleUpgrade} disabled={isProcessing}>
                {isProcessing ? "Przetwarzanie..." : "Zaktualizuj plan"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
