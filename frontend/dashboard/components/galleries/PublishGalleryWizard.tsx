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
  extractDurationFromPlanKey,
  extractStorageFromPlanKey,
  calculateBestPlan,
  type Duration,
  type PlanKey,
} from "../../lib/pricing-plans";
import { useGalleryType } from "../hocs/withGalleryType";
import Button from "../ui/button/Button";

import { CapacityWarning } from "./pricing/CapacityWarning";
import { LimitExceededWarning } from "./pricing/LimitExceededWarning";
import { PlanSelectionGrid } from "./pricing/PlanSelectionGrid";
import { SuggestedPlanSection } from "./pricing/SuggestedPlanSection";
import { StripeRedirectOverlay } from "./StripeRedirectOverlay";

interface LimitExceededData {
  uploadedSizeBytes: number;
  originalsLimitBytes: number;
  excessBytes: number;
  nextTierPlan?: string;
  nextTierPriceCents?: number;
  nextTierLimitBytes?: number;
  isSelectionGallery?: boolean;
}

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
  mode?: "publish" | "limitExceeded";
  limitExceededData?: LimitExceededData;
  onUpgradeSuccess?: () => void;
}

export const PublishGalleryWizard = ({
  isOpen,
  onClose,
  galleryId,
  onSuccess,
  renderAsModal = false,
  initialState,
  mode = "publish",
  limitExceededData,
  onUpgradeSuccess,
}: PublishGalleryWizardProps) => {
  const { showToast } = useToast();
  const router = useRouter();
  const { data: walletData } = useWalletBalance();
  const walletBalanceCents = walletData?.balanceCents ?? 0;
  const { refetch: refetchOrders, data: galleryOrders = [] } = useOrders(galleryId);
  const { isNonSelectionGallery } = useGalleryType();
  const { data: gallery } = useGallery(galleryId);
  const [pricingData, setPricingData] = useState<PricingModalData | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey | null>(null);
  const [showTopUpRedirect, setShowTopUpRedirect] = useState(false);
  const [topUpCheckoutUrl, setTopUpCheckoutUrl] = useState<string | undefined>(undefined);
  const [selectedDuration, setSelectedDuration] = useState<Duration>("1m");
  const hasInitializedPlan = React.useRef(false);

  // Check if gallery has photos
  // For non-selective galleries: check final images from first order
  // For selective galleries: check originalsBytesUsed
  const effectiveOrderIdForFinalImages = useMemo(() => {
    if (isNonSelectionGallery && galleryOrders.length > 0) {
      return galleryOrders[0]?.orderId;
    }
    return undefined;
  }, [isNonSelectionGallery, galleryOrders]);

  const { data: finalImages = [] } = useOrderFinalImages(galleryId, effectiveOrderIdForFinalImages);
  const finalImagesCount = finalImages.length;
  const hasPhotos = isNonSelectionGallery
    ? finalImagesCount > 0
    : (gallery?.originalsBytesUsed ?? 0) > 0;

  const handlePaymentSuccess = useCallback(async () => {
    if (mode === "limitExceeded") {
      onUpgradeSuccess?.();
      onClose();
    } else {
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
          
          onClose();
        }
      } else {
        // For selection galleries, just close the wizard
        onClose();
      }
    }
  }, [
    mode,
    isNonSelectionGallery,
    galleryId,
    refetchOrders,
    router,
    onSuccess,
    onUpgradeSuccess,
    onClose,
  ]);

  const { handleSelectPlan, isProcessing, showRedirectOverlay, redirectInfo } = usePlanPayment({
    galleryId,
    onSuccess: handlePaymentSuccess,
    onClose,
    mode,
    selectedDuration,
    selectedPlanKey: selectedPlanKey || undefined,
  });

  // Restore state from initialState prop (set by store from URL params)
  // BUT: In limitExceeded mode, we want to use the suggested plan, not initialState
  useEffect(() => {
    if (isOpen && initialState) {
      // In limitExceeded mode, ignore initialState planKey - we'll calculate it from uploaded size
      if (mode === "limitExceeded") {
        // Only apply duration if provided, but don't set planKey or mark as initialized
        if (initialState.duration && ["1m", "3m", "12m"].includes(initialState.duration)) {
          setSelectedDuration(initialState.duration as Duration);
        }
      } else {
        // In publish mode, use initialState normally
        if (initialState.duration && ["1m", "3m", "12m"].includes(initialState.duration)) {
          setSelectedDuration(initialState.duration as Duration);
        }
        if (initialState.planKey) {
          setSelectedPlanKey(initialState.planKey as PlanKey);
          hasInitializedPlan.current = true;
        }
      }
    }
    // Reset initialization flag when wizard closes
    if (!isOpen) {
      hasInitializedPlan.current = false;
    }
  }, [isOpen, initialState, mode]);

  // Wallet balance is automatically loaded by React Query
  // No need for manual refresh - React Query handles refetching

  // Load pricing data with React Query (only for publish mode)
  const {
    data: pricingDataFromQuery,
    isLoading: pricingLoading,
    error: pricingError,
  } = useQuery({
    queryKey: ["gallery", "pricing", galleryId, "1m"],
    queryFn: () => getPricingModalData(galleryId, "1m"),
    enabled: isOpen && !!galleryId && mode === "publish",
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

  // Extract current plan storage size and duration for limit exceeded mode
  const currentPlanStorage = useMemo(() => {
    if (mode === "limitExceeded" && gallery?.plan && typeof gallery.plan === "string") {
      return extractStorageFromPlanKey(gallery.plan);
    }
    return null;
  }, [mode, gallery?.plan]);

  const currentPlanDuration = useMemo(() => {
    if (mode === "limitExceeded" && gallery?.plan && typeof gallery.plan === "string") {
      return extractDurationFromPlanKey(gallery.plan);
    }
    return null;
  }, [mode, gallery?.plan]);

  // Extract storage size from suggested plan or calculate from uploaded size
  const suggestedStorage = useMemo(() => {
    let result: "1GB" | "3GB" | "10GB" = "1GB";

    if (mode === "limitExceeded" && limitExceededData?.uploadedSizeBytes) {
      // Calculate suggested plan based on uploaded size and current duration
      const durationToUse = currentPlanDuration || "3m"; // Default to 3m if not available
      const suggestedPlanKey = calculateBestPlan(
        limitExceededData.uploadedSizeBytes,
        durationToUse
      );
      const storage = extractStorageFromPlanKey(suggestedPlanKey);
      if (storage) {
        result = storage;
      }
    } else if (!pricingData?.suggestedPlan?.name) {
      result = "1GB" as "1GB" | "3GB" | "10GB";
    } else {
      const match = pricingData.suggestedPlan.name.match(/^(\d+GB)/);
      result = (match ? match[1] : "1GB") as "1GB" | "3GB" | "10GB";
    }

    return result;
  }, [
    mode,
    limitExceededData?.uploadedSizeBytes,
    currentPlanDuration,
    pricingData?.suggestedPlan?.name,
  ]);

  // Calculate current plan price for upgrade scenarios
  // Use gallery's selectionEnabled status (or limitExceededData if available) to determine discount
  const currentPlanPriceCents = useMemo(() => {
    if (mode === "limitExceeded" && gallery?.plan) {
      const isSelectionGallery =
        mode === "limitExceeded" && limitExceededData
          ? limitExceededData.isSelectionGallery !== false
          : gallery.selectionEnabled !== false;

      return calculatePriceWithDiscount(gallery.plan as PlanKey, isSelectionGallery);
    }
    return 0;
  }, [mode, gallery?.plan, gallery?.selectionEnabled, limitExceededData?.isSelectionGallery]);

  // Determine selection enabled status for price calculations
  const isSelectionGalleryForPricing = useMemo(() => {
    if (mode === "limitExceeded" && limitExceededData) {
      return limitExceededData.isSelectionGallery !== false;
    }
    if (gallery?.selectionEnabled !== undefined) {
      return gallery.selectionEnabled !== false;
    }
    return pricingData?.selectionEnabled !== false;
  }, [
    mode,
    limitExceededData?.isSelectionGallery,
    gallery?.selectionEnabled,
    pricingData?.selectionEnabled,
  ]);

  // Get selected plan details
  const selectedPlan = useMemo(() => {
    if (selectedPlanKey) {
      const plan = getPlan(selectedPlanKey);
      if (plan) {
        const fullPriceCents = calculatePriceWithDiscount(
          selectedPlanKey,
          isSelectionGalleryForPricing
        );

        return {
          planKey: selectedPlanKey,
          priceCents: fullPriceCents, // Backend calculates upgrade difference, but we'll display difference in UI
        };
      }
    }
    // Default to suggested plan with selected duration
    const planKey = getPlanByStorageAndDuration(suggestedStorage, selectedDuration);
    if (planKey) {
      const plan = getPlan(planKey);
      if (plan) {
        const fullPriceCents = calculatePriceWithDiscount(planKey, isSelectionGalleryForPricing);

        return {
          planKey,
          priceCents: fullPriceCents, // Backend calculates upgrade difference, but we'll display difference in UI
        };
      }
    }
    return null;
  }, [selectedPlanKey, selectedDuration, suggestedStorage, isSelectionGalleryForPricing]);

  // Calculate display price (difference for upgrades, full price for new purchases)
  const displayPriceCents = useMemo(() => {
    if (!selectedPlan) return 0;
    if (mode === "limitExceeded" && currentPlanPriceCents > 0) {
      return Math.max(0, selectedPlan.priceCents - currentPlanPriceCents);
    }
    return selectedPlan.priceCents;
  }, [selectedPlan, mode, currentPlanPriceCents]);

  // Initialize selected plan when pricing data loads or limit exceeded data is available
  useEffect(() => {
    // Skip if we've already initialized or if there's already a selected plan
    if (hasInitializedPlan.current || selectedPlanKey) {
      return;
    }

    if (
      mode === "limitExceeded" &&
      limitExceededData?.nextTierPlan &&
      limitExceededData?.uploadedSizeBytes
    ) {
      // Wait for currentPlanDuration to be available if gallery data is still loading
      // This ensures we calculate suggestedStorage correctly
      if (!currentPlanDuration && gallery?.plan) {
        return;
      }

      // Calculate suggested plan directly from uploaded size to avoid dependency on suggestedStorage
      // which might change and cause re-initialization
      const extractedDuration = extractDurationFromPlanKey(limitExceededData.nextTierPlan);
      const durationToUse: Duration = currentPlanDuration || extractedDuration || "1m";

      // Calculate suggested plan based on uploaded size and duration
      const calculatedSuggestedPlanKey = calculateBestPlan(
        limitExceededData.uploadedSizeBytes,
        durationToUse
      );

      if (calculatedSuggestedPlanKey) {
        setSelectedDuration(durationToUse);
        setSelectedPlanKey(calculatedSuggestedPlanKey);
        hasInitializedPlan.current = true;
      } else {
        // Fallback to nextTierPlan if we can't calculate the suggested plan
        const nextTierPlanKey = limitExceededData.nextTierPlan as PlanKey;
        setSelectedPlanKey(nextTierPlanKey);
        hasInitializedPlan.current = true;
      }
    } else if (mode === "publish" && pricingData) {
      const suggestedPlanKey = pricingData.suggestedPlan?.planKey;
      if (suggestedPlanKey) {
        setSelectedPlanKey(suggestedPlanKey as PlanKey);
        hasInitializedPlan.current = true;
      } else {
        // Extract duration from suggested plan name
        const suggestedDuration = pricingData.suggestedPlan?.name?.includes("12")
          ? "12m"
          : pricingData.suggestedPlan?.name?.includes("3")
            ? "3m"
            : "1m";
        // Calculate suggested storage from pricing data
        const match = pricingData.suggestedPlan.name.match(/^(\d+GB)/);
        const storage = (match ? match[1] : "1GB") as "1GB" | "3GB" | "10GB";
        const planKey = getPlanByStorageAndDuration(storage, suggestedDuration as Duration);
        if (planKey) {
          setSelectedPlanKey(planKey);
          setSelectedDuration(suggestedDuration as Duration);
          hasInitializedPlan.current = true;
        }
      }
    }
  }, [
    mode,
    limitExceededData?.nextTierPlan,
    limitExceededData?.uploadedSizeBytes,
    pricingData,
    selectedPlanKey,
    currentPlanDuration,
    gallery?.plan,
    suggestedStorage,
  ]);

  // Check if wallet balance is sufficient
  // For upgrades, use display price (difference); for new purchases, use full price
  const walletBalance = walletBalanceCents ?? 0;
  const priceToCheck =
    mode === "limitExceeded" ? displayPriceCents : (selectedPlan?.priceCents ?? 0);
  const isBalanceSufficient = selectedPlan ? walletBalance >= priceToCheck : false;
  const balanceShortfall = selectedPlan ? Math.max(0, priceToCheck - walletBalance) : 0;

  const handlePublish = () => {
    if (!selectedPlan) {
      showToast("error", "Błąd", "Proszę wybrać plan");
      return;
    }
    if (mode === "publish" && !hasPhotos) {
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

      // Show redirect overlay IMMEDIATELY when button is clicked (before any async operations)
      // This provides instant feedback, especially important in wizards where buttons get disabled
      setShowTopUpRedirect(true);
      setTopUpCheckoutUrl(undefined); // Reset URL, will be set when API responds

      try {
        // Construct redirect URL with wizard state
        const params = new URLSearchParams();
        if (mode === "limitExceeded") {
          params.set("limitExceeded", "true");
          // Store limitExceededData in URL params so we can restore it when coming back
          if (limitExceededData) {
            params.set("uploadedSizeBytes", limitExceededData.uploadedSizeBytes.toString());
            params.set("originalsLimitBytes", limitExceededData.originalsLimitBytes.toString());
            params.set("excessBytes", limitExceededData.excessBytes.toString());
            if (limitExceededData.isSelectionGallery !== undefined) {
              params.set("isSelectionGallery", limitExceededData.isSelectionGallery.toString());
            }
          }
        } else {
          params.set("publish", "true");
        }
        params.set("galleryId", galleryId);
        params.set("duration", selectedDuration);
        if (selectedPlanKey) {
          params.set("planKey", selectedPlanKey);
        }

        const redirectUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}?${params.toString()}`
            : "";

        const data = await createCheckoutMutation.mutateAsync({
          amountCents,
          type: "wallet_topup",
          redirectUrl,
        });

        // Update checkout URL once we receive it (overlay is already visible)
        if (data.checkoutUrl) {
          setTopUpCheckoutUrl(data.checkoutUrl);
        } else {
          // No checkout URL means we're not redirecting to Stripe - hide overlay
          const errorMsg = "Nie otrzymano URL do płatności";
          showToast("error", "Błąd", errorMsg);
          setShowTopUpRedirect(false);
        }
      } catch (err) {
        // Error occurred - hide overlay and show error
        const errorMsg = formatApiError(err as Error);
        showToast("error", "Błąd", errorMsg);
        setShowTopUpRedirect(false);
      }
    },
    [
      mode,
      galleryId,
      selectedDuration,
      selectedPlanKey,
      limitExceededData,
      showToast,
      createCheckoutMutation,
    ]
  );

  const wizardContent = !isOpen ? null : (
    <div
      className={`${renderAsModal ? "w-full max-w-7xl h-[calc(100vh-2rem)]" : "w-full max-h-[calc(100vh-100px)]"} flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {mode === "limitExceeded" ? "Zwiększ limit galerii" : "Opublikuj galerię"}
          </h1>
          {mode === "limitExceeded" && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Płacisz tylko różnicę między nowym planem a aktualnym planem
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          disabled={isProcessing || pricingLoading}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          aria-label="Zamknij"
        >
          <X className="w-6 h-6" strokeWidth={2} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {pricingError && (
          <div className="sticky top-0 z-10 max-w-4xl w-full mx-auto px-8 pt-8 pb-4">
            <div className="p-4 bg-error-50 border border-error-200 rounded-xl text-error-600 dark:bg-error-500/10 dark:border-error-500/20 dark:text-error-400">
              {formatApiError(pricingError)}
            </div>
          </div>
        )}

        {pricingLoading ? (
          <div className="flex items-start justify-center p-8 min-h-full">
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
        ) : (mode === "limitExceeded" && limitExceededData) ||
          (mode === "publish" && pricingData) ? (
          <div className="flex items-start justify-center p-8 min-h-full">
            <div className="w-full max-w-6xl mx-auto space-y-6">
              {mode === "limitExceeded" && limitExceededData ? (
                <LimitExceededWarning
                  uploadedSizeBytes={limitExceededData.uploadedSizeBytes}
                  originalsLimitBytes={limitExceededData.originalsLimitBytes}
                  excessBytes={limitExceededData.excessBytes}
                />
              ) : pricingData ? (
                <CapacityWarning
                  uploadedSizeBytes={pricingData.uploadedSizeBytes}
                  originalsLimitBytes={pricingData.originalsLimitBytes}
                />
              ) : null}

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
                selectionEnabled={
                  mode === "limitExceeded"
                    ? limitExceededData?.isSelectionGallery !== false
                    : pricingData?.selectionEnabled !== false
                }
                mode={mode}
                currentPlanKey={typeof gallery?.plan === "string" ? gallery.plan : undefined}
                currentPlanPriceCents={currentPlanPriceCents}
                onDurationChange={(duration) => {
                  // Always update duration when clicking in SuggestedPlanSection
                  // This ensures PlanSelectionGrid duration selector stays in sync
                  setSelectedDuration(duration);
                  const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
                  if (planKey) {
                    setSelectedPlanKey(planKey);
                    // Mark as initialized when user explicitly selects a plan
                    hasInitializedPlan.current = true;
                  }
                }}
                onPlanKeyChange={(planKey) => {
                  setSelectedPlanKey(planKey);
                  // Mark as initialized when user explicitly selects a plan
                  if (planKey) {
                    hasInitializedPlan.current = true;
                  }
                }}
              />

              <PlanSelectionGrid
                suggestedStorage={suggestedStorage}
                selectedDuration={selectedDuration}
                selectedPlanKey={selectedPlanKey}
                selectionEnabled={
                  mode === "limitExceeded"
                    ? limitExceededData?.isSelectionGallery !== false
                    : pricingData?.selectionEnabled !== false
                }
                mode={mode}
                currentPlanKey={typeof gallery?.plan === "string" ? gallery.plan : undefined}
                currentPlanPriceCents={currentPlanPriceCents}
                disabledPlanSizes={
                  mode === "limitExceeded" && currentPlanStorage ? [currentPlanStorage] : []
                }
                onDurationChange={(duration) => {
                  // Always allow user-initiated duration changes
                  setSelectedDuration(duration);

                  // Update plan to match the new duration with suggested storage
                  const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
                  if (planKey) {
                    setSelectedPlanKey(planKey);
                    // Mark as initialized when user explicitly changes duration/plan
                    hasInitializedPlan.current = true;
                  }
                }}
                onPlanKeyChange={(planKey) => {
                  setSelectedPlanKey(planKey);
                  // Mark as initialized when user explicitly selects a plan
                  if (planKey) {
                    hasInitializedPlan.current = true;
                  }
                }}
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
          disabled={
            isProcessing || pricingLoading || !selectedPlan || (mode === "publish" && !hasPhotos)
          }
          className="flex-1"
        >
          {isProcessing
            ? "Przetwarzanie..."
            : selectedPlan
              ? mode === "limitExceeded"
                ? `Zwiększ limit (${formatPrice(displayPriceCents)})`
                : `Opublikuj (${formatPrice(selectedPlan.priceCents)})`
              : "Wybierz plan"}
        </Button>
      </div>

      {/* Processing Overlay - blocks wizard during payment processing */}
      {isProcessing && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 bg-brand-500 dark:bg-brand-400 rounded-full animate-pulse"
                style={{ animationDelay: "0s" }}
              ></div>
              <div
                className="w-3 h-3 bg-brand-500 dark:bg-brand-400 rounded-full animate-pulse"
                style={{ animationDelay: "0.2s" }}
              ></div>
              <div
                className="w-3 h-3 bg-brand-500 dark:bg-brand-400 rounded-full animate-pulse"
                style={{ animationDelay: "0.4s" }}
              ></div>
            </div>
            <p className="text-lg text-gray-700 dark:text-gray-300 font-medium">
              Przetwarzanie płatności...
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Proszę czekać, nie zamykaj tej strony
            </p>
          </div>
        </div>
      )}

      {/* Stripe Redirect Overlay for plan payment */}
      <StripeRedirectOverlay
        isVisible={showRedirectOverlay}
        checkoutUrl={redirectInfo?.checkoutUrl}
      />

      {/* Stripe Redirect Overlay for wallet topup */}
      <StripeRedirectOverlay isVisible={showTopUpRedirect} checkoutUrl={topUpCheckoutUrl} />
    </div>
  );

  // If not open, return null
  if (!isOpen || !wizardContent) {
    return null;
  }

  // If renderAsModal is true, wrap in backdrop and portal covering full page
  if (renderAsModal) {
    const modalContent = (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-6"
        onClick={(e) => {
          // Prevent closing modal by clicking backdrop during processing
          if (isProcessing || pricingLoading) {
            e.stopPropagation();
            return;
          }
          // Allow closing by clicking backdrop when not processing
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
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
