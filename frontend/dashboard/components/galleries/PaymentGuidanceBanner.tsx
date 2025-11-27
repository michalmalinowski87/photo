import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { formatPrice } from "../../lib/format-price";
import Button from "../ui/button/Button";

import { GalleryPricingModal } from "./GalleryPricingModal";

interface PlanOption {
  name: string;
  priceCents: number;
  storage: string;
  duration: string;
  planKey: string;
}

interface NextTierPlan extends PlanOption {
  storageLimitBytes: number;
}

interface Gallery {
  state?: string;
  paymentStatus?: string;
  plan?: string;
  priceCents?: number;
  originalsLimitBytes?: number;
  finalsLimitBytes?: number;
  originalsBytesUsed?: number;
  finalsBytesUsed?: number;
  selectionEnabled?: boolean;
  [key: string]: unknown;
}

interface PaymentGuidanceBannerProps {
  galleryId: string;
  gallery: Gallery;
  onPaymentComplete?: () => void;
}

export const PaymentGuidanceBanner: React.FC<PaymentGuidanceBannerProps> = ({
  galleryId,
  gallery,
  onPaymentComplete,
}) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [pricingModalData, setPricingModalData] = useState<{
    suggestedPlan: PlanOption;
    originalsLimitBytes: number;
    finalsLimitBytes: number;
    uploadedSizeBytes: number;
    selectionEnabled: boolean;
    usagePercentage?: number;
    isNearCapacity?: boolean;
    isAtCapacity?: boolean;
    exceedsLargestPlan?: boolean;
    nextTierPlan?: NextTierPlan;
  } | null>(null);
  const [uploadedSizeBytes, setUploadedSizeBytes] = useState<number | null>(null);
  const [isLoadingSize, setIsLoadingSize] = useState(false);

  // Check if gallery needs payment
  const needsPayment = gallery.state === "DRAFT" || gallery.paymentStatus === "UNPAID";

  // Load uploaded size if not available
  useEffect(() => {
    if (!needsPayment) {
      return;
    }

    const loadUploadedSize = async () => {
      if (gallery.originalsBytesUsed !== undefined) {
        setUploadedSizeBytes(gallery.originalsBytesUsed || 0);
        return;
      }

      // If not available in gallery, try to calculate it
      setIsLoadingSize(true);
      try {
        const planResult = await api.galleries.calculatePlan(galleryId);
        setUploadedSizeBytes(planResult.uploadedSizeBytes || 0);
      } catch (error) {
        console.error("Failed to load uploaded size:", error);
        setUploadedSizeBytes(0);
      } finally {
        setIsLoadingSize(false);
      }
    };

    void loadUploadedSize();
  }, [galleryId, gallery.originalsBytesUsed, needsPayment]);

  useEffect(() => {
    if (!needsPayment) {
      return;
    }

    // Load wallet balance
    const loadWalletBalance = async () => {
      setIsLoadingWallet(true);
      try {
        const balance = await api.wallet.getBalance();
        setWalletBalance(balance.balanceCents);
      } catch (error) {
        console.error("Failed to load wallet balance:", error);
        // Don't show error to user, just leave walletBalance as null
      } finally {
        setIsLoadingWallet(false);
      }
    };

    void loadWalletBalance();
  }, [needsPayment]);

  if (!needsPayment) {
    return null;
  }

  const formatBytes = (bytes: number | undefined | null): string => {
    if (!bytes || bytes === 0) {
      return "0 GB";
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const handlePublishGallery = async () => {
    setIsProcessingPayment(true);
    try {
      // Always calculate plan first - this will determine the best plan based on uploaded photos
      try {
        const planResult = await api.galleries.calculatePlan(galleryId);

        // Show pricing modal to let user select plan
        const nextTierPlan: NextTierPlan | undefined =
          planResult.nextTierPlan &&
          typeof planResult.nextTierPlan === "object" &&
          "duration" in planResult.nextTierPlan
            ? (planResult.nextTierPlan as NextTierPlan)
            : undefined;

        setPricingModalData({
          suggestedPlan: planResult.suggestedPlan as string,
          originalsLimitBytes: planResult.originalsLimitBytes,
          finalsLimitBytes: planResult.finalsLimitBytes,
          uploadedSizeBytes: planResult.uploadedSizeBytes,
          selectionEnabled: planResult.selectionEnabled,
          usagePercentage: planResult.usagePercentage as number,
          isNearCapacity: planResult.isNearCapacity as boolean,
          isAtCapacity: planResult.isAtCapacity as boolean,
          exceedsLargestPlan: planResult.exceedsLargestPlan as boolean,
          nextTierPlan,
        });
        setIsProcessingPayment(false);
        return;
      } catch (_calcError) {
        showToast("error", "Błąd", "Nie udało się obliczyć planu. Spróbuj ponownie.");
        setIsProcessingPayment(false);
        return;
      }
    } catch (error) {
      showToast("error", "Błąd", formatApiError(error));
      setIsProcessingPayment(false);
    }
  };

  const walletAmount = walletBalance ?? 0;
  const currentUploadedBytes: number =
    uploadedSizeBytes ?? gallery.originalsBytesUsed ?? 0;
  const hasUploadedPhotos = currentUploadedBytes > 0;

  if (isMinimized) {
    return (
      <div className="bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/20 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-warning-600 dark:text-warning-400 font-semibold">
              Galeria nieopublikowana
            </span>
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            className="text-warning-600 dark:text-warning-400 hover:text-warning-700 dark:hover:text-warning-300 text-sm underline"
          >
            Rozwiń
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-brand-50 dark:bg-gray-800 border-2 border-brand-200 dark:border-brand-700 rounded-lg p-6 mb-6 shadow-theme-lg">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Opublikuj galerię, aby ją aktywować
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {hasUploadedPhotos
              ? "Opublikuj galerię, aby ją aktywować. System automatycznie wybierze najbardziej optymalny plan na podstawie przesłanych zdjęć."
              : "Prześlij zdjęcia do galerii, aby system mógł wybrać najbardziej optymalny plan dla Twojej galerii. Po przesłaniu zdjęć będziesz mógł opublikować galerię i wybrać plan."}
          </p>
        </div>
        <button
          onClick={() => setIsMinimized(true)}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 ml-4"
          aria-label="Minimalizuj"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Storage Usage Info */}
      {hasUploadedPhotos && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 border border-brand-200 dark:border-brand-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              Wykorzystane miejsce:
            </span>
            <span className="text-2xl font-bold text-brand-600 dark:text-brand-400">
              {formatBytes(currentUploadedBytes)}
            </span>
          </div>
          {isLoadingSize && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Obliczanie...</p>
          )}
        </div>
      )}

      {!hasUploadedPhotos && (
        <div className="bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-warning-900 dark:text-warning-200 mb-2">
            Następne kroki:
          </p>
          <ol className="list-decimal list-inside text-sm text-warning-800 dark:text-warning-300 space-y-1">
            <li>Prześlij zdjęcia do galerii (przejdź do zakładki &quot;Zdjęcia&quot;)</li>
            <li>System automatycznie obliczy plan na podstawie rozmiaru przesłanych zdjęć</li>
            <li>Po przesłaniu zdjęć opublikuj galerię i wybierz plan</li>
          </ol>
        </div>
      )}

      {/* Payment Amount - Only show if plan is already calculated */}
      {gallery.plan && gallery.priceCents !== undefined && gallery.priceCents !== null && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 border border-brand-200 dark:border-brand-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              Kwota do zapłaty:
            </span>
            <span className="text-2xl font-bold text-brand-600 dark:text-brand-400">
              {formatPrice(gallery.priceCents)}
            </span>
          </div>

          {/* Plan Details */}
          {gallery.plan && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Plan:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">
                    {gallery.plan}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Typ galerii:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">
                    {gallery.selectionEnabled !== false ? "Z selekcją" : "Bez selekcji"}
                    {gallery.selectionEnabled === false && (
                      <span className="text-success-600 dark:text-success-400 ml-1">
                        (zniżka 20%)
                      </span>
                    )}
                  </span>
                </div>
                {gallery.originalsLimitBytes && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Limit oryginałów:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                      {formatBytes(gallery.originalsLimitBytes)}
                    </span>
                  </div>
                )}
                {gallery.finalsLimitBytes && (
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Limit finalnych:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                      {formatBytes(gallery.finalsLimitBytes)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Wallet Balance - Only show if plan is already calculated */}
      {!isLoadingWallet &&
        walletBalance !== null &&
        gallery.plan &&
        gallery.priceCents !== undefined &&
        gallery.priceCents !== null && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 border border-brand-200 dark:border-brand-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Saldo portfela:</span>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatPrice(walletAmount)}
              </span>
            </div>
            {walletAmount > 0 && (
              <div className="mt-2">
                {walletAmount > 0 && (
                  <p className="text-sm text-success-600 dark:text-success-400 font-medium">
                    Możesz zaoszczędzić {formatPrice(Math.min(walletAmount, gallery.priceCents))}{" "}
                    używając portfela
                  </p>
                )}
                {walletAmount < gallery.priceCents && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Pozostało do zapłaty:{" "}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatPrice(Math.max(0, gallery.priceCents - walletAmount))}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        {hasUploadedPhotos ? (
          <Button
            variant="primary"
            onClick={handlePublishGallery}
            disabled={isProcessingPayment}
            className="w-full"
          >
            {isProcessingPayment ? "Obliczanie planu..." : "Opublikuj galerię"}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => router.push(`/galleries/${galleryId}/photos`)}
            className="w-full"
          >
            Przejdź do zdjęć
          </Button>
        )}
      </div>

      {/* Pricing Modal */}
      {pricingModalData && (
        <GalleryPricingModal
          isOpen={!!pricingModalData}
          onClose={() => {
            setPricingModalData(null);
          }}
          galleryId={galleryId}
          suggestedPlan={pricingModalData.suggestedPlan}
          originalsLimitBytes={pricingModalData.originalsLimitBytes}
          finalsLimitBytes={pricingModalData.finalsLimitBytes}
          uploadedSizeBytes={pricingModalData.uploadedSizeBytes}
          selectionEnabled={pricingModalData.selectionEnabled}
          onPlanSelected={() => {
            setPricingModalData(null);
            onPaymentComplete?.();
          }}
        />
      )}
    </div>
  );
};
