import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";

import { useCreateCheckout } from "../../hooks/mutations/useWalletMutations";
import { useGallery } from "../../hooks/queries/useGalleries";
import { useOrders, useOrderFinalImages } from "../../hooks/queries/useOrders";
import { useWalletBalance } from "../../hooks/queries/useWallet";
import { usePlanPayment } from "../../hooks/usePlanPayment";
import { useToast } from "../../hooks/useToast";
import { formatApiError } from "../../lib/api-service";
import { getPricingModalData } from "../../lib/calculate-plan";
import { formatPrice } from "../../lib/format-price";
import type { PricingModalData } from "../../lib/plan-types";
import {
  getPlanByStorageAndDuration,
  calculatePriceWithDiscount,
  getPlan,
  type Duration,
  type PlanKey,
} from "../../lib/pricing-plans";
import { useGalleryType } from "../hocs/withGalleryType";
import Button from "../ui/button/Button";

import { CapacityWarning } from "./pricing/CapacityWarning";
import { PlanSelectionGrid } from "./pricing/PlanSelectionGrid";
import { SuggestedPlanSection } from "./pricing/SuggestedPlanSection";
import { StripeRedirectOverlay } from "./StripeRedirectOverlay";

interface PublishGalleryWizardProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  onSuccess?: () => void;
  renderAsModal?: boolean; // If true, renders with backdrop overlay covering full page. If false, renders inline like gallery view
  initialState?: {
    duration?: string;
    planKey?: string;
  } | null;
}

export const PublishGalleryWizard: React.FC<PublishGalleryWizardProps> = ({
  isOpen,
  onClose,
  galleryId,
  onSuccess,
  renderAsModal = false,
  initialState,
}) => {
  const { showToast } = useToast();
  const router = useRouter();
  const { data: walletData } = useWalletBalance();
  const walletBalanceCents = walletData?.balanceCents ?? 0;
  const { refetch: refetchOrders, data: galleryOrders = [] } = useOrders(galleryId);
  const { isNonSelectionGallery } = useGalleryType();
  const { data: gallery } = useGallery(galleryId);
  const [pricingData, setPricingData] = useState<PricingModalData | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<Duration>("1m");

  // Check if gallery has photos
  // For non-selective galleries: check final images from first order
  // For selective galleries: check originalsBytesUsed
  const effectiveOrderIdForFinalImages = useMemo(() => {
    if (isNonSelectionGallery && galleryOrders.length > 0) {
      return galleryOrders[0]?.orderId;
    }
    return undefined;
  }, [isNonSelectionGallery, galleryOrders]);

  const { data: finalImages = [] } = useOrderFinalImages(
    galleryId,
    effectiveOrderIdForFinalImages
  );
  const finalImagesCount = finalImages.length;
  const hasPhotos = isNonSelectionGallery
    ? finalImagesCount > 0
    : (gallery?.originalsBytesUsed ?? 0) > 0;

  const handlePaymentSuccess = useCallback(async () => {
    onSuccess?.();

    // For non-selection galleries, navigate to order view after payment
    if (isNonSelectionGallery) {
      try {
        // Refetch orders to get the latest
        const result = await refetchOrders();
        const fetchedOrders = result.data ?? [];
        if (fetchedOrders && fetchedOrders.length > 0) {
          const firstOrder = fetchedOrders[0] as { orderId?: string };
          if (firstOrder?.orderId) {
            void router.push(`/galleries/${galleryId}/orders/${firstOrder.orderId}`);
            return;
          }
        }
        // If no orders found, just close the wizard
        onClose();
      } catch (err) {
        console.error("Failed to fetch orders after payment:", err);
        onClose();
      }
    } else {
      // For selection galleries, just close the wizard
      onClose();
    }
  }, [isNonSelectionGallery, galleryId, refetchOrders, router, onSuccess, onClose]);

  const { handleSelectPlan, isProcessing, showRedirectOverlay, redirectInfo } = usePlanPayment({
    galleryId,
    onSuccess: handlePaymentSuccess,
    onClose,
  });

  // Restore state from initialState prop (set by store from URL params)
  useEffect(() => {
    if (isOpen && initialState) {
      if (initialState.duration && ["1m", "3m", "12m"].includes(initialState.duration)) {
        setSelectedDuration(initialState.duration as Duration);
      }
      if (initialState.planKey) {
        setSelectedPlanKey(initialState.planKey as PlanKey);
      }
    }
  }, [isOpen, initialState]);

  // Wallet balance is automatically loaded by React Query
  // No need for manual refresh - React Query handles refetching

  // Load pricing data with React Query
  const {
    data: pricingDataFromQuery,
    isLoading: pricingLoading,
    error: pricingError,
  } = useQuery({
    queryKey: ["gallery", "pricing", galleryId, "1m"],
    queryFn: () => getPricingModalData(galleryId, "1m"),
    enabled: isOpen && !!galleryId,
    staleTime: 60 * 1000, // Pricing data doesn't change frequently
  });

  useEffect(() => {
    if (pricingDataFromQuery) {
      setPricingData(pricingDataFromQuery);
    }
  }, [pricingDataFromQuery]);

  useEffect(() => {
    if (pricingError) {
      const errorMsg = formatApiError(pricingError);
      showToast("error", "Błąd", errorMsg);
    }
  }, [pricingError, showToast]);

  // Extract storage size from suggested plan
  const suggestedStorage = useMemo(() => {
    if (!pricingData?.suggestedPlan?.name) {
      return "1GB" as "1GB" | "3GB" | "10GB";
    }
    const match = pricingData.suggestedPlan.name.match(/^(\d+GB)/);
    return (match ? match[1] : "1GB") as "1GB" | "3GB" | "10GB";
  }, [pricingData?.suggestedPlan?.name]);

  // Get selected plan details
  const selectedPlan = useMemo(() => {
    if (selectedPlanKey) {
      const plan = getPlan(selectedPlanKey);
      if (plan) {
        return {
          planKey: selectedPlanKey,
          priceCents: calculatePriceWithDiscount(
            selectedPlanKey,
            pricingData?.selectionEnabled !== false
          ),
        };
      }
    }
    // Default to suggested plan with selected duration
    const planKey = getPlanByStorageAndDuration(suggestedStorage, selectedDuration);
    if (planKey) {
      const plan = getPlan(planKey);
      if (plan) {
        return {
          planKey,
          priceCents: calculatePriceWithDiscount(planKey, pricingData?.selectionEnabled !== false),
        };
      }
    }
    return null;
  }, [selectedPlanKey, selectedDuration, suggestedStorage, pricingData?.selectionEnabled]);

  // Initialize selected plan when pricing data loads
  useEffect(() => {
    if (pricingData && !selectedPlanKey) {
      const suggestedPlanKey = pricingData.suggestedPlan?.planKey;
      if (suggestedPlanKey) {
        setSelectedPlanKey(suggestedPlanKey as PlanKey);
      } else {
        // Extract duration from suggested plan name
        const suggestedDuration = pricingData.suggestedPlan?.name?.includes("12")
          ? "12m"
          : pricingData.suggestedPlan?.name?.includes("3")
            ? "3m"
            : "1m";
        const planKey = getPlanByStorageAndDuration(
          suggestedStorage,
          suggestedDuration as Duration
        );
        if (planKey) {
          setSelectedPlanKey(planKey);
          setSelectedDuration(suggestedDuration as Duration);
        }
      }
    }
  }, [pricingData, suggestedStorage, selectedPlanKey]);

  // Check if wallet balance is sufficient
  const walletBalance = walletBalanceCents ?? 0;
  const isBalanceSufficient = selectedPlan ? walletBalance >= selectedPlan.priceCents : false;
  const balanceShortfall = selectedPlan ? Math.max(0, selectedPlan.priceCents - walletBalance) : 0;

  const handlePublish = () => {
    if (!selectedPlan) {
      showToast("error", "Błąd", "Proszę wybrać plan");
      return;
    }
    if (!hasPhotos) {
      showToast("error", "Błąd", "Najpierw prześlij zdjęcia");
      return;
    }

    void handleSelectPlan(selectedPlan);
  };

  const createCheckoutMutation = useCreateCheckout();

  const handleTopUp = useCallback(
    async (amountCents: number) => {
      if (amountCents < 2000) {
        showToast("error", "Błąd", "Minimalna kwota doładowania to 20 PLN");
        return;
      }

      try {
        // Construct redirect URL with wizard state
        const redirectUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}?publish=true&galleryId=${galleryId}&duration=${selectedDuration}&planKey=${selectedPlanKey ?? ""}`
            : "";

        const data = await createCheckoutMutation.mutateAsync({
          amountCents,
          type: "wallet_topup",
          redirectUrl,
        });

        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          showToast("error", "Błąd", "Nie otrzymano URL do płatności");
        }
      } catch (err) {
        showToast("error", "Błąd", formatApiError(err as Error));
      }
    },
    [galleryId, selectedDuration, selectedPlanKey, showToast, createCheckoutMutation]
  );

  const wizardContent = !isOpen ? null : (
    <div
      className={`${renderAsModal ? "w-full max-w-7xl h-[calc(100vh-2rem)]" : "w-full max-h-[calc(100vh-100px)]"} flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Opublikuj galerię</h1>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Zamknij"
        >
          <X className="w-6 h-6" strokeWidth={2} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative">
        {pricingError && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10 max-w-4xl w-full px-8">
            <div className="p-4 bg-error-50 border border-error-200 rounded-xl text-error-600 dark:bg-error-500/10 dark:border-error-500/20 dark:text-error-400">
              {formatApiError(pricingError)}
            </div>
          </div>
        )}

        {pricingLoading ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="w-full max-w-6xl mx-auto space-y-6">
              {/* Wallet Balance Section Skeleton */}
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 h-[205.33px] animate-fade-in-out"></div>

              {/* Suggested Plan Section Skeleton */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 border-2 border-blue-300 dark:border-blue-500/30 rounded-lg px-6 pt-6 pb-4 mb-4 h-[279.33px] animate-fade-in-out"></div>

              {/* Plan Selection Grid Skeleton */}
              <div className="mb-4 h-[360px] animate-fade-in-out">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>
                <div className="flex items-center justify-center gap-2 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <div className="flex-1 h-10 bg-white dark:bg-gray-700 rounded-md"></div>
                  <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-600 rounded-md"></div>
                  <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-600 rounded-md"></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="rounded-lg border-2 border-gray-200 dark:border-gray-700 p-5 h-[248px] animate-fade-in-out"
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : pricingData ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="w-full max-w-6xl mx-auto space-y-6">
              <CapacityWarning
                uploadedSizeBytes={pricingData.uploadedSizeBytes}
                originalsLimitBytes={pricingData.originalsLimitBytes}
              />

              {/* Wallet Balance Section */}
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Saldo portfela</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatPrice(walletBalance)}
                    </p>
                  </div>
                  {!isBalanceSufficient && selectedPlan && (
                    <div className="text-right">
                      <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
                        Brakuje: {formatPrice(balanceShortfall)}
                      </p>
                    </div>
                  )}
                </div>

                {!isBalanceSufficient && selectedPlan && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Szybkie doładowanie:
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[
                          Math.max(2000, Math.ceil(balanceShortfall / 100) * 100),
                          Math.max(5000, Math.ceil(balanceShortfall / 100) * 100 + 3000),
                          Math.max(10000, Math.ceil(balanceShortfall / 100) * 100 + 8000),
                        ].map((amountCents) => (
                          <Button
                            key={amountCents}
                            size="sm"
                            variant="primary"
                            onClick={() => void handleTopUp(amountCents)}
                            disabled={createCheckoutMutation.isPending}
                          >
                            +{amountCents / 100} PLN
                          </Button>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      Doładowanie portfela jest tańsze niż płatność przez Stripe (brak opłat
                      przetwarzania).
                    </p>
                  </div>
                )}
              </div>

              <SuggestedPlanSection
                suggestedStorage={suggestedStorage}
                selectedDuration={selectedDuration}
                selectedPlanKey={selectedPlanKey}
                selectionEnabled={pricingData.selectionEnabled}
                onDurationChange={(duration) => {
                  setSelectedDuration(duration);
                  const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
                  if (planKey) {
                    setSelectedPlanKey(planKey);
                  }
                }}
                onPlanKeyChange={setSelectedPlanKey}
              />

              <PlanSelectionGrid
                suggestedStorage={suggestedStorage}
                selectedDuration={selectedDuration}
                selectedPlanKey={selectedPlanKey}
                selectionEnabled={pricingData.selectionEnabled}
                onDurationChange={(duration) => {
                  setSelectedDuration(duration);
                  // Only reset to suggested plan if no explicit plan is selected
                  // or if the current selected plan doesn't match the new duration
                  if (!selectedPlanKey) {
                    const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
                    if (planKey) {
                      setSelectedPlanKey(planKey);
                    }
                  } else {
                    // Check if current selected plan matches the new duration
                    const currentPlan = getPlan(selectedPlanKey);
                    const currentPlanDuration =
                      currentPlan?.duration === "1 miesiąc"
                        ? "1m"
                        : currentPlan?.duration === "3 miesiące"
                          ? "3m"
                          : "12m";
                    if (currentPlanDuration !== duration) {
                      // Selected plan doesn't match new duration, reset to suggested
                      const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
                      if (planKey) {
                        setSelectedPlanKey(planKey);
                      }
                    }
                  }
                }}
                onPlanKeyChange={setSelectedPlanKey}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex-shrink-0">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={isProcessing || pricingLoading}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 border-red-300 dark:border-red-700"
        >
          Anuluj
        </Button>
        <Button
          variant="primary"
          onClick={handlePublish}
          disabled={isProcessing || pricingLoading || !selectedPlan || !hasPhotos}
          className="flex-1"
        >
          {isProcessing
            ? "Przetwarzanie..."
            : selectedPlan
              ? `Opublikuj (${formatPrice(selectedPlan.priceCents)})`
              : "Wybierz plan"}
        </Button>
      </div>

      {/* Stripe Redirect Overlay */}
      <StripeRedirectOverlay
        isVisible={showRedirectOverlay}
        checkoutUrl={redirectInfo?.checkoutUrl}
      />
    </div>
  );

  // If not open, return null
  if (!isOpen || !wizardContent) {
    return null;
  }

  // If renderAsModal is true, wrap in backdrop and portal covering full page
  if (renderAsModal) {
    const modalContent = (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-6">
        {wizardContent}
      </div>
    );

    // Render modal via portal to document.body to ensure it's above all other content
    if (typeof window !== "undefined") {
      return createPortal(modalContent, document.body);
    }

    return modalContent;
  }

  // Otherwise, render inline (like in gallery view)
  return wizardContent;
};
