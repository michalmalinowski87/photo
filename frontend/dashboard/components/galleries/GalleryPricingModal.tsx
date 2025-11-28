import React, { useState, useMemo, useEffect } from "react";

import { usePlanPayment } from "../../hooks/usePlanPayment";
import type { PlanOption, NextTierPlan } from "../../lib/plan-types";
import {
  getPlanByStorageAndDuration,
  getPlan,
  calculatePriceWithDiscount,
  type Duration,
  type PlanKey,
} from "../../lib/pricing-plans";
import { formatPrice } from "../../lib/format-price";
import Button from "../ui/button/Button";
import { CapacityWarning } from "./pricing/CapacityWarning";
import { PlanSelectionGrid } from "./pricing/PlanSelectionGrid";
import { SuggestedPlanSection } from "./pricing/SuggestedPlanSection";
import { UploadedSizeInfo } from "./pricing/UploadedSizeInfo";
import { StripeRedirectOverlay } from "./StripeRedirectOverlay";

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
  uploadedSizeBytes,
  selectionEnabled,
  onPlanSelected,
}) => {
  const [selectedPlanKey, setSelectedPlanKey] = useState<PlanKey | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<Duration>("1m");

  const {
    handleSelectPlan,
    isProcessing,
    showRedirectOverlay,
    redirectInfo,
    setShowRedirectOverlay,
  } = usePlanPayment({
    galleryId,
    onSuccess: onPlanSelected,
    onClose,
  });

  // Extract storage size from suggested plan (e.g., "1GB - 1 miesiąc" -> "1GB")
  const suggestedStorage = useMemo(() => {
    const match = suggestedPlan.name.match(/^(\d+GB)/);
    return (match ? match[1] : "1GB") as "1GB" | "3GB" | "10GB";
  }, [suggestedPlan.name]);

  // Get selected plan details
  const selectedPlan = useMemo(() => {
    if (selectedPlanKey) {
      const plan = getPlan(selectedPlanKey);
      if (plan) {
        return {
          planKey: selectedPlanKey,
          priceCents: calculatePriceWithDiscount(selectedPlanKey, selectionEnabled),
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
          priceCents: calculatePriceWithDiscount(planKey, selectionEnabled),
        };
      }
    }
    return null;
  }, [selectedPlanKey, selectedDuration, suggestedStorage, selectionEnabled]);

  // Initialize selected plan when modal opens
  useEffect(() => {
    if (isOpen) {
      // Extract duration from suggested plan
      const suggestedDuration = suggestedPlan.name.includes("12")
        ? "12m"
        : suggestedPlan.name.includes("3")
          ? "3m"
          : "1m";
      setSelectedDuration(suggestedDuration as Duration);
      // Preselect the suggested plan
      const suggestedPlanKey = getPlanByStorageAndDuration(
        suggestedStorage,
        suggestedDuration as Duration
      );
      if (suggestedPlanKey) {
        setSelectedPlanKey(suggestedPlanKey);
      } else {
        setSelectedPlanKey(null); // Reset to use suggested plan
      }
    }
  }, [isOpen, suggestedPlan.name, suggestedStorage]);

  if (!isOpen) {
    return null;
  }

  const handleSelectPlanClick = () => {
    void handleSelectPlan(selectedPlan);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Wybierz plan dla swojej galerii
          </h2>

          <UploadedSizeInfo uploadedSizeBytes={uploadedSizeBytes} />

          <CapacityWarning
            uploadedSizeBytes={uploadedSizeBytes}
            originalsLimitBytes={originalsLimitBytes}
          />

          <SuggestedPlanSection
            suggestedStorage={suggestedStorage}
            selectedDuration={selectedDuration}
            selectedPlanKey={selectedPlanKey}
            selectionEnabled={selectionEnabled}
            onDurationChange={setSelectedDuration}
            onPlanKeyChange={setSelectedPlanKey}
          />

          <PlanSelectionGrid
            suggestedStorage={suggestedStorage}
            selectedDuration={selectedDuration}
            selectedPlanKey={selectedPlanKey}
            selectionEnabled={selectionEnabled}
            onDurationChange={setSelectedDuration}
            onPlanKeyChange={setSelectedPlanKey}
          />

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
              Anuluj
            </Button>
            <Button
              variant="primary"
              onClick={handleSelectPlanClick}
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

      {/* Stripe Redirect Overlay */}
      <StripeRedirectOverlay
        isVisible={showRedirectOverlay}
        checkoutUrl={redirectInfo?.checkoutUrl}
      />
    </div>
  );
};
