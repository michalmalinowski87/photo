import { useRouter } from "next/router";
import React, { useState, useEffect, useRef } from "react";

import { usePlanRecommendation } from "../../hooks/usePlanRecommendation";
import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { getPricingModalData } from "../../lib/calculate-plan";
import type { PricingModalData } from "../../lib/plan-types";
import {
  getPlanByStorageAndDuration,
  calculatePriceWithDiscount,
  getPlan,
} from "../../lib/pricing-plans";

import { GalleryPricingModal } from "./GalleryPricingModal";
import { NoPhotosUploadedBanner } from "./NoPhotosUploadedBanner";
import { PaymentMethodGuidance } from "./PaymentMethodGuidance";
import { PlanRecommendationSection } from "./PlanRecommendationSection";

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

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [pricingModalData, setPricingModalData] = useState<PricingModalData | null>(null);
  const [paymentMethodInfo, setPaymentMethodInfo] = useState<{
    paymentMethod?: "WALLET" | "STRIPE";
    walletAmountCents?: number;
    stripeAmountCents?: number;
    stripeFeeCents?: number;
    totalAmountCents?: number;
  } | null>(null);
  const lastDryRunParamsRef = useRef<{ planKey: string; priceCents: number } | null>(null);

  // Check if gallery needs payment
  const needsPayment = gallery.state === "DRAFT" || gallery.paymentStatus === "UNPAID";

  // Extract stable values from gallery to prevent infinite loops in useEffect dependencies
  const selectionEnabled = gallery.selectionEnabled !== false;
  const originalsBytesUsed = gallery.originalsBytesUsed ?? 0;

  // Use plan recommendation hook
  const {
    planRecommendation,
    isLoadingPlanRecommendation,
    uploadedSizeBytes,
    selectedDuration,
    setSelectedDuration,
  } = usePlanRecommendation({
    galleryId,
    needsPayment,
    selectionEnabled,
    originalsBytesUsed,
  });

  // Call dry run to determine payment method when plan recommendation is available
  useEffect(() => {
    if (!needsPayment || !galleryId || !planRecommendation || isLoadingPlanRecommendation) {
      // Don't clear paymentMethodInfo to prevent flickering - keep the last value
      lastDryRunParamsRef.current = null;
      return;
    }

    const callDryRun = async () => {
      // Get plan key for selected duration
      const storageMatch = planRecommendation.suggestedPlan.name.match(/^(\d+GB)/);
      const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
      const currentDuration = selectedDuration ?? "1m";
      const planKey = getPlanByStorageAndDuration(storage, currentDuration);

      if (!planKey) {
        // Don't clear paymentMethodInfo to prevent flickering
        lastDryRunParamsRef.current = null;
        return;
      }

      const plan = getPlan(planKey);
      if (!plan) {
        // Don't clear paymentMethodInfo to prevent flickering
        lastDryRunParamsRef.current = null;
        return;
      }

      const priceCents = calculatePriceWithDiscount(planKey, gallery.selectionEnabled !== false);

      // Skip API call if we already called it with the same parameters
      if (
        lastDryRunParamsRef.current?.planKey === planKey &&
        lastDryRunParamsRef.current.priceCents === priceCents
      ) {
        return; // Already have the data for these parameters
      }

      // Don't set loading state - API is fast and we want to avoid flickering
      try {
        // Call dry run with plan details
        const dryRunResult = await api.galleries.pay(galleryId, {
          dryRun: true,
          plan: planKey,
          priceCents,
        });

        // Store the parameters we just called with
        lastDryRunParamsRef.current = { planKey, priceCents };

        setPaymentMethodInfo({
          paymentMethod: dryRunResult.paymentMethod ?? "STRIPE",
          walletAmountCents: Number(dryRunResult.walletAmountCents) ?? 0,
          stripeAmountCents: Number(dryRunResult.stripeAmountCents) ?? 0,
          stripeFeeCents: Number(dryRunResult.stripeFeeCents) ?? 0,
          totalAmountCents: Number(dryRunResult.totalAmountCents) ?? 0,
        });
      } catch (error: unknown) {
        console.error("Failed to get payment method info:", error);
        // Don't clear paymentMethodInfo on error to prevent flickering - keep last known value
        lastDryRunParamsRef.current = null;
      }
    };

    void callDryRun();
    // Use planKey and priceCents derived values instead of planRecommendation object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    galleryId,
    needsPayment,
    isLoadingPlanRecommendation,
    // Extract stable values from planRecommendation instead of the object itself
    planRecommendation?.suggestedPlan?.name,
    planRecommendation?.suggestedPlan?.planKey,
    selectedDuration,
    selectionEnabled,
  ]);

  // Handle payment method info refresh after topup
  const handleTopUpComplete = (): void => {
    // Clear the last params ref to force a refresh of payment method info
    lastDryRunParamsRef.current = null;
    // Re-trigger the dry run to get updated payment info
    if (planRecommendation && galleryId && needsPayment && !isLoadingPlanRecommendation) {
      const storageMatch = planRecommendation.suggestedPlan.name.match(/^(\d+GB)/);
      const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
      const currentDuration = selectedDuration ?? "1m";
      const planKey = getPlanByStorageAndDuration(storage, currentDuration);
      if (planKey) {
        const plan = getPlan(planKey);
        if (plan) {
          const priceCents = calculatePriceWithDiscount(planKey, selectionEnabled);
          // Trigger the dry run again to refresh payment info
          void api.galleries
            .pay(galleryId, {
              dryRun: true,
              plan: planKey,
              priceCents,
            })
            .then((dryRunResult) => {
              setPaymentMethodInfo({
                paymentMethod: dryRunResult.paymentMethod ?? "STRIPE",
                walletAmountCents: Number(dryRunResult.walletAmountCents) ?? 0,
                stripeAmountCents: Number(dryRunResult.stripeAmountCents) ?? 0,
                stripeFeeCents: Number(dryRunResult.stripeFeeCents) ?? 0,
                totalAmountCents: Number(dryRunResult.totalAmountCents) ?? 0,
              });
              lastDryRunParamsRef.current = { planKey, priceCents };
            })
            .catch((error: unknown) => {
              console.error("Failed to refresh payment method info after top-up:", error);
            });
        }
      }
    }
  };

  if (!needsPayment) {
    return null;
  }

  // Use plan recommendation data if available (more up-to-date), otherwise fall back to gallery data
  // IMPORTANT: Don't use gallery.originalsBytesUsed until loading is complete to prevent flicker
  const currentUploadedBytes: number =
    uploadedSizeBytes ??
    (isLoadingPlanRecommendation
      ? 0 // While loading, assume no photos to prevent flicker
      : (planRecommendation?.uploadedSizeBytes ?? gallery.originalsBytesUsed ?? 0));
  // Only show plan content if we're not loading AND we have a plan recommendation
  const hasUploadedPhotos =
    !isLoadingPlanRecommendation && currentUploadedBytes > 0 && planRecommendation !== null;

  const handlePublishGallery = async () => {
    setIsProcessingPayment(true);
    try {
      // Always calculate plan first - this will determine the best plan based on uploaded photos
      try {
        const modalData = await getPricingModalData(galleryId);
        // Update modal data with selected duration
        if (modalData && hasUploadedPhotos) {
          const storageMatch = modalData.suggestedPlan.name.match(/^(\d+GB)/);
          const storage = (storageMatch ? storageMatch[1] : "1GB") as "1GB" | "3GB" | "10GB";
          const currentDuration = selectedDuration ?? "1m";
          const planKey = getPlanByStorageAndDuration(storage, currentDuration);
          if (planKey) {
            const plan = getPlan(planKey);
            if (plan) {
              modalData.suggestedPlan = {
                ...modalData.suggestedPlan,
                planKey,
                name: plan.label,
                priceCents: calculatePriceWithDiscount(planKey, selectionEnabled),
                duration: plan.duration,
              };
              modalData.originalsLimitBytes = plan.storageLimitBytes;
              modalData.finalsLimitBytes = plan.storageLimitBytes;
            }
          }
        }
        setPricingModalData(modalData);
        setIsProcessingPayment(false);
        return;
      } catch (_calcError) {
        showToast("error", "Błąd", "Nie udało się obliczyć planu. Spróbuj ponownie.");
        setIsProcessingPayment(false);
        return;
      }
    } catch (error: unknown) {
      showToast("error", "Błąd", formatApiError(error as Error));
      setIsProcessingPayment(false);
    }
  };

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
      {hasUploadedPhotos && (
        <PlanRecommendationSection
          planRecommendation={planRecommendation}
          isLoading={isLoadingPlanRecommendation}
          uploadedSizeBytes={uploadedSizeBytes}
          selectedDuration={selectedDuration}
          setSelectedDuration={setSelectedDuration}
          selectionEnabled={selectionEnabled}
        />
      )}

      {/* Payment Method Guidance */}
      {hasUploadedPhotos && (
        <PaymentMethodGuidance
          paymentMethodInfo={paymentMethodInfo}
          onTopUpComplete={handleTopUpComplete}
        />
      )}

      {!hasUploadedPhotos && <NoPhotosUploadedBanner galleryId={galleryId} />}

      {/* Action Button */}
      {hasUploadedPhotos && (
        <div>
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
        </div>
      )}

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
