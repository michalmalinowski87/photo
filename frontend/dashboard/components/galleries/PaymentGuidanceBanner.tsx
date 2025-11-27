import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { getPlanRecommendation, getPricingModalData } from "../../lib/calculate-plan";
import { formatPrice } from "../../lib/format-price";
import type { PlanRecommendation, PricingModalData } from "../../lib/plan-types";

import { GalleryPricingModal } from "./GalleryPricingModal";

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
  const [pricingModalData, setPricingModalData] = useState<PricingModalData | null>(null);
  const [uploadedSizeBytes, setUploadedSizeBytes] = useState<number | null>(null);
  const [isLoadingSize, setIsLoadingSize] = useState(false);
  const [planRecommendation, setPlanRecommendation] = useState<PlanRecommendation | null>(null);
  const [isLoadingPlanRecommendation, setIsLoadingPlanRecommendation] = useState(false);

  // Check if gallery needs payment
  const needsPayment = gallery.state === "DRAFT" || gallery.paymentStatus === "UNPAID";

  // Load uploaded size and plan recommendation if photos are uploaded
  useEffect(() => {
    if (!needsPayment) {
      return;
    }

    const loadUploadedSizeAndPlan = async () => {
      if (gallery.originalsBytesUsed !== undefined) {
        const size = gallery.originalsBytesUsed || 0;
        setUploadedSizeBytes(size);

        // If photos are uploaded, load plan recommendation
        if (size > 0) {
          setIsLoadingPlanRecommendation(true);
          try {
            const recommendation = await getPlanRecommendation(galleryId);
            setPlanRecommendation(recommendation);
          } catch (error) {
            console.error("Failed to load plan recommendation:", error);
          } finally {
            setIsLoadingPlanRecommendation(false);
          }
        }
        return;
      }

      // If not available in gallery, try to calculate it
      setIsLoadingSize(true);
      try {
        const recommendation = await getPlanRecommendation(galleryId);
        const size = recommendation.uploadedSizeBytes || 0;
        setUploadedSizeBytes(size);

        // If photos are uploaded, store plan recommendation
        if (size > 0) {
          setPlanRecommendation(recommendation);
        }
      } catch (error) {
        console.error("Failed to load uploaded size:", error);
        setUploadedSizeBytes(0);
      } finally {
        setIsLoadingSize(false);
      }
    };

    void loadUploadedSizeAndPlan();
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
        const modalData = await getPricingModalData(galleryId);
        setPricingModalData(modalData);
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
  const currentUploadedBytes: number = uploadedSizeBytes ?? gallery.originalsBytesUsed ?? 0;
  const hasUploadedPhotos = currentUploadedBytes > 0;

  if (isMinimized) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6 shadow-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-white">
              Galeria nieopublikowana
            </span>
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            Rozwiń
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 shadow-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Opublikuj galerię, aby ją aktywować
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {hasUploadedPhotos
              ? "System przeanalizował przesłane zdjęcia i zaproponował najbardziej optymalny plan. Możesz wybrać ten plan lub inny podczas publikacji galerii."
              : "Prześlij zdjęcia do galerii, aby system mógł wybrać najbardziej optymalny plan dla Twojej galerii. Po przesłaniu zdjęć będziesz mógł opublikować galerię i wybrać plan."}
          </p>
        </div>
        <button
          onClick={() => setIsMinimized(true)}
          className="flex-shrink-0 p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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

      {/* Plan Recommendation */}
      {hasUploadedPhotos && planRecommendation && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Zaproponowany plan
                </span>
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {planRecommendation.suggestedPlan.name}
              </h4>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                {formatPrice(planRecommendation.suggestedPlan.priceCents)}
              </div>
              {gallery.selectionEnabled === false && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-green-100 dark:bg-green-900/30 text-xs font-medium text-green-700 dark:text-green-400">
                  Zniżka 20%
                </span>
              )}
            </div>
          </div>

          {/* Storage Usage and Limits */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Wykorzystane miejsce
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatBytes(currentUploadedBytes)}
              </p>
              {isLoadingSize && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Obliczanie...</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Limit oryginałów
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatBytes(planRecommendation.originalsLimitBytes)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Limit finalnych
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatBytes(planRecommendation.finalsLimitBytes)}
              </p>
            </div>
          </div>

          {/* Usage Indicator */}
          {planRecommendation.usagePercentage !== undefined && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Wykorzystanie pojemności
                </span>
                <span
                  className={`text-sm font-semibold ${
                    planRecommendation.isNearCapacity
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-gray-900 dark:text-white"
                  }`}
                >
                  {planRecommendation.usagePercentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    planRecommendation.isNearCapacity
                      ? "bg-amber-500 dark:bg-amber-400"
                      : "bg-blue-600 dark:bg-blue-500"
                  }`}
                  style={{
                    width: `${Math.min(planRecommendation.usagePercentage, 100)}%`,
                  }}
                />
              </div>
              {planRecommendation.isNearCapacity && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Galeria jest prawie pełna. Rozważ wybór większego planu.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {hasUploadedPhotos && isLoadingPlanRecommendation && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <svg
              className="animate-spin h-5 w-5 text-gray-600 dark:text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Obliczanie rekomendacji planu...
            </p>
          </div>
        </div>
      )}

      {!hasUploadedPhotos && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-5 mb-6 border border-amber-200 dark:border-amber-800/30">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <svg
                className="w-5 h-5 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Następne kroki:
              </p>
              <ol className="space-y-2.5">
                {[
                  "Prześlij zdjęcia do galerii (przejdź do zakładki &quot;Zdjęcia&quot;)",
                  "System automatycznie obliczy plan na podstawie rozmiaru przesłanych zdjęć",
                  "Po przesłaniu zdjęć opublikuj galerię i wybierz plan",
                ].map((step, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold text-xs mt-0.5">
                      {index + 1}
                    </span>
                    <span className="flex-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
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

      {/* Action Button */}
      <div>
        {hasUploadedPhotos ? (
          <button
            onClick={handlePublishGallery}
            disabled={isProcessingPayment}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 px-6 py-3 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
          >
            {isProcessingPayment ? (
              <>
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Obliczanie planu...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span>Opublikuj galerię</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => router.push(`/galleries/${galleryId}/photos`)}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 px-6 py-3 text-white font-semibold transition-colors shadow-sm hover:shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>Przejdź do zdjęć</span>
          </button>
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
