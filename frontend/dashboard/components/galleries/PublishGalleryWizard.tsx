import { useRouter } from "next/router";
import React, { useState, useEffect, useMemo, useCallback } from "react";

import { usePlanPayment } from "../../hooks/usePlanPayment";
import { useToast } from "../../hooks/useToast";
import { formatPrice } from "../../lib/format-price";
import { getPricingModalData } from "../../lib/calculate-plan";
import type { PricingModalData } from "../../lib/plan-types";
import {
  getPlanByStorageAndDuration,
  calculatePriceWithDiscount,
  getPlan,
  type Duration,
  type PlanKey,
} from "../../lib/pricing-plans";
import { useUserStore } from "../../store/userSlice";
import api, { formatApiError } from "../../lib/api-service";
import Button from "../ui/button/Button";
import Input from "../ui/input/InputField";

import { CapacityWarning } from "./pricing/CapacityWarning";
import { PlanSelectionGrid } from "./pricing/PlanSelectionGrid";
import { SuggestedPlanSection } from "./pricing/SuggestedPlanSection";
import { UploadedSizeInfo } from "./pricing/UploadedSizeInfo";
import { StripeRedirectOverlay } from "./StripeRedirectOverlay";

interface PublishGalleryWizardProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  onSuccess?: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const PublishGalleryWizard: React.FC<PublishGalleryWizardProps> = ({
  isOpen,
  onClose,
  galleryId,
  onSuccess,
}) => {
  const router = useRouter();
  const { showToast } = useToast();
  const { walletBalanceCents, refreshWalletBalance } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pricingData, setPricingData] = useState<PricingModalData | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<Duration>("1m");
  const [photoCount, setPhotoCount] = useState<number | null>(null);

  const { handleSelectPlan, isProcessing, showRedirectOverlay, redirectInfo } = usePlanPayment({
    galleryId,
    onSuccess: () => {
      onSuccess?.();
      onClose();
    },
    onClose,
  });

  // Check URL params for state restoration
  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const publishParam = params.get("publish");
      const galleryParam = params.get("galleryId");
      const durationParam = params.get("duration") as Duration | null;
      const planKeyParam = params.get("planKey") as PlanKey | null;

      // If we're opening from URL params, restore state
      if (publishParam === "true" && galleryParam === galleryId) {
        if (durationParam && ["1m", "3m", "12m"].includes(durationParam)) {
          setSelectedDuration(durationParam);
        }
        if (planKeyParam) {
          setSelectedPlanKey(planKeyParam);
        }

        // Clear URL params after reading
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("publish");
        newUrl.searchParams.delete("galleryId");
        newUrl.searchParams.delete("duration");
        newUrl.searchParams.delete("planKey");
        window.history.replaceState({}, "", newUrl.toString());
      }
    }
  }, [isOpen, galleryId]);

  // Load pricing data and photo count
  useEffect(() => {
    if (!isOpen || !galleryId) {
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        // Load pricing data
        const data = await getPricingModalData(galleryId, selectedDuration);
        setPricingData(data);

        // Load photo count
        try {
          const imagesResponse = await api.galleries.getImages(galleryId);
          setPhotoCount(imagesResponse.images?.length ?? 0);
        } catch (err) {
          console.error("Failed to load photo count:", err);
          setPhotoCount(null);
        }

        // Load wallet balance
        await refreshWalletBalance();
      } catch (err) {
        const errorMsg = formatApiError(err as Error);
        setError(errorMsg);
        showToast("error", "Błąd", errorMsg);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [isOpen, galleryId, selectedDuration, refreshWalletBalance, showToast]);

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
        const planKey = getPlanByStorageAndDuration(suggestedStorage, suggestedDuration as Duration);
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
  const balanceShortfall = selectedPlan
    ? Math.max(0, selectedPlan.priceCents - walletBalance)
    : 0;

  const handlePublish = async () => {
    if (!selectedPlan) {
      showToast("error", "Błąd", "Proszę wybrać plan");
      return;
    }

    void handleSelectPlan(selectedPlan);
  };

  const [topUpAmount, setTopUpAmount] = useState<string>("");
  const [isTopUpLoading, setIsTopUpLoading] = useState(false);

  const handleTopUp = useCallback(
    async (amountCents: number) => {
      if (amountCents < 2000) {
        showToast("error", "Błąd", "Minimalna kwota doładowania to 20 PLN");
        return;
      }

      setIsTopUpLoading(true);

      try {
        // Construct redirect URL with wizard state
        const redirectUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}?publish=true&galleryId=${galleryId}&duration=${selectedDuration}&planKey=${selectedPlanKey ?? ""}`
            : "";

        const data = await api.payments.createCheckout({
          amountCents,
          type: "wallet_topup",
          redirectUrl,
        });

        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          showToast("error", "Błąd", "Nie otrzymano URL do płatności");
          setIsTopUpLoading(false);
        }
      } catch (err) {
        showToast("error", "Błąd", formatApiError(err as Error));
        setIsTopUpLoading(false);
      }
    },
    [galleryId, selectedDuration, selectedPlanKey, showToast]
  );

  const handleCustomTopUp = () => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount < 20) {
      showToast("error", "Błąd", "Minimalna kwota doładowania to 20 PLN");
      return;
    }
    void handleTopUp(Math.round(amount * 100));
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="w-full h-[calc(100vh-140px)] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Opublikuj galerię</h1>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Zamknij"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 relative">
        {error && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10 max-w-4xl w-full px-8">
            <div className="p-4 bg-error-50 border border-error-200 rounded-xl text-error-600 dark:bg-error-500/10 dark:border-error-500/20 dark:text-error-400">
              {error}
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Ładowanie danych planu...</p>
            </div>
          </div>
        ) : pricingData ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="w-full max-w-6xl mx-auto space-y-6">
              {/* Uploaded Photos Info */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Przesłane zdjęcia
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {photoCount !== null ? photoCount : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Wykorzystane miejsce
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {formatBytes(pricingData.uploadedSizeBytes)}
                    </p>
                  </div>
                </div>
              </div>

              <UploadedSizeInfo uploadedSizeBytes={pricingData.uploadedSizeBytes} />

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
                  <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                      <strong>Niewystarczające saldo.</strong> Doładowanie portfela jest tańsze niż
                      płatność przez Stripe (brak opłat przetwarzania).
                    </p>
                    <div className="space-y-3">
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
                              disabled={isTopUpLoading}
                            >
                              +{amountCents / 100} PLN
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Własna kwota:
                        </div>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            placeholder="Kwota (min 20 PLN)"
                            value={topUpAmount}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.,]/g, "");
                              setTopUpAmount(value);
                            }}
                            className="flex-1"
                          />
                          <Button
                            variant="primary"
                            onClick={handleCustomTopUp}
                            disabled={isTopUpLoading}
                          >
                            Doładuj
                          </Button>
                        </div>
                      </div>
                    </div>
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
                  const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
                  if (planKey) {
                    setSelectedPlanKey(planKey);
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
        <Button variant="outline" onClick={onClose} disabled={isProcessing || loading}>
          Anuluj
        </Button>
        <Button
          variant="primary"
          onClick={handlePublish}
          disabled={isProcessing || loading || !selectedPlan}
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
};

