import React, { useState, useMemo } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { formatPrice } from "../../lib/format-price";
import type { PlanOption, NextTierPlan } from "../../lib/plan-types";
import {
  getAllPlansGroupedByStorage,
  getPlanByStorageAndDuration,
  calculatePriceWithDiscount,
  getPlan,
  type Duration,
  type PlanKey,
} from "../../lib/pricing-plans";
import Button from "../ui/button/Button";

interface GalleryPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
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
  onPlanSelected?: () => void;
}

export const GalleryPricingModal: React.FC<GalleryPricingModalProps> = ({
  isOpen,
  onClose,
  galleryId,
  suggestedPlan,
  originalsLimitBytes,
  finalsLimitBytes: _finalsLimitBytes,
  uploadedSizeBytes,
  selectionEnabled,
  usagePercentage: _usagePercentage,
  isNearCapacity: _isNearCapacity,
  isAtCapacity: _isAtCapacity,
  exceedsLargestPlan: _exceedsLargestPlan,
  nextTierPlan: _nextTierPlan,
  onPlanSelected,
}) => {
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<Duration>("1m");

  // Extract storage size from suggested plan (e.g., "1GB - 1 miesiąc" -> "1GB")
  const suggestedStorage = useMemo(() => {
    const match = suggestedPlan.name.match(/^(\d+GB)/);
    return (match ? match[1] : "1GB") as "1GB" | "3GB" | "10GB";
  }, [suggestedPlan.name]);

  // Get all plans grouped by storage
  const allPlans = useMemo(() => getAllPlansGroupedByStorage(), []);

  // Get selected plan details
  const selectedPlan = useMemo(() => {
    if (selectedPlanKey) {
      const plan = getPlan(selectedPlanKey);
      if (plan) {
        return {
          planKey: selectedPlanKey,
          name: plan.label,
          priceCents: calculatePriceWithDiscount(selectedPlanKey, selectionEnabled),
          storage: plan.storage,
          duration: plan.duration,
          storageLimitBytes: plan.storageLimitBytes,
          expiryDays: plan.expiryDays,
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
          name: plan.label,
          priceCents: calculatePriceWithDiscount(planKey, selectionEnabled),
          storage: plan.storage,
          duration: plan.duration,
          storageLimitBytes: plan.storageLimitBytes,
          expiryDays: plan.expiryDays,
        };
      }
    }
    return null;
  }, [selectedPlanKey, selectedDuration, suggestedStorage, selectionEnabled]);

  // Initialize selected plan when modal opens
  React.useEffect(() => {
    if (isOpen) {
      // Extract duration from suggested plan
      const suggestedDuration = suggestedPlan.name.includes("12")
        ? "12m"
        : suggestedPlan.name.includes("3")
          ? "3m"
          : "1m";
      setSelectedDuration(suggestedDuration as Duration);
      setSelectedPlanKey(null); // Reset to use suggested plan
    }
  }, [isOpen, suggestedPlan.name]);

  if (!isOpen) {
    return null;
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // formatPrice is now imported from format-price utility

  const handleSelectPlan = async () => {
    if (!selectedPlan) {
      showToast("error", "Błąd", "Proszę wybrać plan.");
      return;
    }

    setIsProcessing(true);
    try {
      const planMetadata = getPlan(selectedPlan.planKey);
      if (!planMetadata) {
        showToast("error", "Błąd", "Nieprawidłowy plan.");
        setIsProcessing(false);
        return;
      }

      // First, update gallery with the selected plan details
      // This ensures the gallery has plan, priceCents, and limits set before payment
      await api.galleries.update(galleryId, {
        plan: selectedPlan.planKey,
        priceCents: selectedPlan.priceCents,
        originalsLimitBytes: planMetadata.storageLimitBytes,
        finalsLimitBytes: planMetadata.storageLimitBytes, // Finals limit same as originals
      });

      // Now proceed to payment
      const paymentResult = await api.galleries.pay(galleryId, {});

      if (paymentResult.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = paymentResult.checkoutUrl;
      } else if (paymentResult.paid) {
        // Already paid or paid via wallet
        showToast("success", "Sukces", "Plan został wybrany i opłacony!");
        onPlanSelected?.();
        onClose();
      } else {
        showToast("error", "Błąd", "Nie udało się przetworzyć płatności.");
      }
    } catch (error: unknown) {
      showToast("error", "Błąd", formatApiError(error as Error));
    } finally {
      setIsProcessing(false);
    }
  };

  const uploadedMB = (uploadedSizeBytes / (1024 * 1024)).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Wybierz plan dla swojej galerii
          </h2>

          {/* Uploaded Size Info */}
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
              <strong>Przesłany rozmiar:</strong> {uploadedMB} MB
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Plan został automatycznie dopasowany do rozmiaru przesłanych zdjęć.
            </p>
          </div>

          {/* USER-CENTRIC FIX #1: Capacity Warning */}
          {(() => {
            const usagePercentage = (uploadedSizeBytes / originalsLimitBytes) * 100;
            const usedGB = (uploadedSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
            const limitGB = (originalsLimitBytes / (1024 * 1024 * 1024)).toFixed(0);

            if (usagePercentage >= 95) {
              return (
                <div className="bg-yellow-50 dark:bg-warning-500/10 border border-yellow-300 dark:border-warning-500/20 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <svg
                      className="w-5 h-5 text-yellow-600 dark:text-warning-400 mt-0.5 mr-2 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-yellow-800 dark:text-warning-300 mb-1">
                        Uwaga: Galeria jest prawie pełna
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-warning-200 mb-2">
                        Używasz {usedGB} GB z {limitGB} GB ({usagePercentage.toFixed(1)}%
                        pojemności). Po opłaceniu będziesz mógł przesłać tylko niewielką ilość
                        dodatkowych zdjęć.
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-warning-300">
                        💡 <strong>Wskazówka:</strong> Rozważ wybór większego planu, aby mieć więcej
                        miejsca na przyszłe zdjęcia.
                      </p>
                    </div>
                  </div>
                </div>
              );
            } else if (usagePercentage >= 80) {
              return (
                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    ℹ️ Używasz {usedGB} GB z {limitGB} GB ({usagePercentage.toFixed(1)}%
                    pojemności). Po opłaceniu będziesz mógł przesłać jeszcze{" "}
                    {((originalsLimitBytes - uploadedSizeBytes) / (1024 * 1024 * 1024)).toFixed(1)}{" "}
                    GB zdjęć.
                  </p>
                </div>
              );
            }
            return null;
          })()}

          {/* Suggested Plan with Duration Selection */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 border-2 border-blue-300 dark:border-blue-500/30 rounded-lg p-6 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Zaproponowany plan
                </h3>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-3">
                  {suggestedStorage}
                </p>

                {/* Duration Selector */}
                <div className="flex gap-2 mb-4">
                  {(["1m", "3m", "12m"] as Duration[]).map((duration) => {
                    const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
                    const isSelected =
                      selectedPlanKey === planKey ||
                      (!selectedPlanKey && selectedDuration === duration);
                    const price = planKey
                      ? calculatePriceWithDiscount(planKey, selectionEnabled)
                      : 0;

                    return (
                      <button
                        key={duration}
                        onClick={() => {
                          setSelectedDuration(duration);
                          setSelectedPlanKey(planKey);
                        }}
                        className={`px-4 py-2 rounded-lg border-2 transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold"
                            : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600"
                        }`}
                      >
                        <div className="text-sm">
                          {duration === "1m"
                            ? "1 miesiąc"
                            : duration === "3m"
                              ? "3 miesiące"
                              : "12 miesięcy"}
                        </div>
                        <div className="text-xs mt-0.5">{formatPrice(price)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="text-right ml-4">
                {selectedPlan && (
                  <>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {formatPrice(selectedPlan.priceCents)}
                    </p>
                    {!selectionEnabled && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                        (zniżka 20%)
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Plan Details */}
            {selectedPlan && (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-500/30">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Limit oryginałów
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {formatBytes(selectedPlan.storageLimitBytes)}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-500/30">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Limit finalnych</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {formatBytes(selectedPlan.storageLimitBytes)}
                    </p>
                  </div>
                </div>

                {/* Gallery Type Info */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-500/30">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>Typ galerii:</strong>{" "}
                    {selectionEnabled ? (
                      <span>Z selekcją klienta</span>
                    ) : (
                      <span>
                        Bez selekcji{" "}
                        <span className="text-green-600 dark:text-green-400">(zniżka 20%)</span>
                      </span>
                    )}
                  </p>
                  {selectionEnabled && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Limit finalnych zdjęć jest taki sam jak limit oryginałów (darmowy bufor).
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* All Available Plans */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Wszystkie dostępne plany
            </h3>
            <div className="space-y-4">
              {allPlans.map(({ storage, plans }) => {
                const isSelectedStorage = selectedPlan?.storage === storage;
                return (
                  <div
                    key={storage}
                    className={`border-2 rounded-lg p-4 ${
                      isSelectedStorage
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {storage}
                      </h4>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {plans.map(({ duration, planKey }) => {
                        const isSelected = selectedPlanKey === planKey;
                        const price = calculatePriceWithDiscount(planKey, selectionEnabled);

                        return (
                          <button
                            key={planKey}
                            onClick={() => {
                              setSelectedPlanKey(planKey);
                              setSelectedDuration(duration);
                            }}
                            className={`p-3 rounded-lg border-2 transition-all text-left ${
                              isSelected
                                ? "border-blue-500 bg-blue-100 dark:bg-blue-900/30"
                                : "border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600"
                            }`}
                          >
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                              {duration === "1m"
                                ? "1 miesiąc"
                                : duration === "3m"
                                  ? "3 miesiące"
                                  : "12 miesięcy"}
                            </div>
                            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                              {formatPrice(price)}
                            </div>
                            {!selectionEnabled && (
                              <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                                -20%
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
              Anuluj
            </Button>
            <Button
              variant="primary"
              onClick={handleSelectPlan}
              disabled={isProcessing || !selectedPlan}
            >
              {isProcessing
                ? "Przetwarzanie..."
                : selectedPlan
                  ? `Wybierz plan i opłać (${formatPrice(selectedPlan.priceCents)})`
                  : "Wybierz plan"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
