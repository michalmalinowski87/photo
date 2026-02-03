import React from "react";

import { formatPrice } from "../../../lib/format-price";
import {
  getPlanByStorageAndDuration,
  calculatePriceWithReferralDiscount,
  getPlan,
  type Duration,
  type PlanKey,
} from "../../../lib/pricing-plans";

interface SuggestedPlanSectionProps {
  suggestedStorage: "1GB" | "3GB" | "10GB";
  selectedDuration: Duration;
  selectedPlanKey: PlanKey | null;
  selectionEnabled: boolean;
  onDurationChange: (duration: Duration) => void;
  onPlanKeyChange: (planKey: PlanKey | null) => void;
  mode?: "publish" | "limitExceeded";
  currentPlanKey?: string;
  currentPlanPriceCents?: number;
  /** When set (10 or 15), show referral discount label. */
  referralDiscountPercent?: 10 | 15;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const SuggestedPlanSection = ({
  suggestedStorage,
  selectedDuration,
  selectedPlanKey,
  selectionEnabled: _selectionEnabled,
  onDurationChange,
  onPlanKeyChange,
  mode = "publish",
  currentPlanKey,
  currentPlanPriceCents = 0,
  referralDiscountPercent,
}: SuggestedPlanSectionProps) => {
  // Get selected plan details
  const selectedPlan = React.useMemo(() => {
    if (selectedPlanKey) {
      const plan = getPlan(selectedPlanKey);
      if (plan) {
        return {
          planKey: selectedPlanKey,
          name: plan.label,
          priceCents: calculatePriceWithReferralDiscount(selectedPlanKey, referralDiscountPercent),
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
          priceCents: calculatePriceWithReferralDiscount(planKey, referralDiscountPercent),
          storage: plan.storage,
          duration: plan.duration,
          storageLimitBytes: plan.storageLimitBytes,
          expiryDays: plan.expiryDays,
        };
      }
    }
    return null;
  }, [selectedPlanKey, selectedDuration, suggestedStorage, referralDiscountPercent]);

  return (
    <div className="bg-gradient-to-r from-photographer-elevated to-photographer-lightBeige dark:from-photographer-accent/10 dark:to-photographer-accent/10 border-2 border-photographer-darkBeige dark:border-photographer-accent/30 rounded-lg px-6 pt-6 pb-4 mb-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Zaproponowany plan
          </h3>
          <p className="text-lg font-semibold text-photographer-accent dark:text-photographer-accentLight mb-3">
            {suggestedStorage}
          </p>

          {/* Duration Selector */}
          <div className="flex gap-2 mb-4">
            {(["1m", "3m", "12m"] as Duration[]).map((duration) => {
              const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
              const isSelected =
                selectedPlanKey === planKey || (!selectedPlanKey && selectedDuration === duration);
              const fullPrice = planKey ? calculatePriceWithReferralDiscount(planKey, referralDiscountPercent) : 0;
              // For upgrades, show the upgrade price (difference)
              const displayPrice =
                mode === "limitExceeded" && currentPlanPriceCents > 0 && planKey === currentPlanKey
                  ? 0 // Current plan - no upgrade needed
                  : mode === "limitExceeded" && currentPlanPriceCents > 0
                    ? Math.max(0, fullPrice - currentPlanPriceCents)
                    : fullPrice;

              // Check if this duration is shorter than current plan duration
              const isShorterDuration =
                mode === "limitExceeded" && currentPlanKey && planKey
                  ? (() => {
                      const currentPlan = getPlan(currentPlanKey as PlanKey);
                      const plan = getPlan(planKey);
                      if (currentPlan && plan) {
                        // Use expiryDays for comparison (more reliable than duration string)
                        const durationDays: Record<Duration, number> = {
                          "1m": 30,
                          "3m": 90,
                          "12m": 365,
                        };
                        const currentDurationDays = currentPlan.expiryDays;
                        const newDurationDays = durationDays[duration];
                        return newDurationDays < currentDurationDays;
                      }
                      return false;
                    })()
                  : false;

              const isDisabled =
                mode === "limitExceeded" && (planKey === currentPlanKey || isShorterDuration);

              return (
                <button
                  key={duration}
                  onClick={() => {
                    if (!isDisabled) {
                      onDurationChange(duration);
                      onPlanKeyChange(planKey);
                    }
                  }}
                  disabled={isDisabled}
                  className={`px-4 py-2 rounded-lg transition-all font-medium ${
                    isDisabled
                      ? "opacity-50 cursor-not-allowed outline-2 outline-gray-300 dark:outline-gray-600 outline bg-photographer-elevated dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                      : isSelected
                        ? "outline-2 outline-photographer-accent/60 outline bg-photographer-accentLight/50 dark:bg-photographer-accentDark/20 text-photographer-accentDark dark:text-gray-300"
                        : "outline-2 outline-gray-300 dark:outline-gray-600 outline bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:outline-photographer-darkBeige dark:hover:outline-photographer-accent"
                  }`}
                >
                  <div className="text-sm">
                    {duration === "1m"
                      ? "1 miesiąc"
                      : duration === "3m"
                        ? "3 miesiące"
                        : "12 miesięcy"}
                  </div>
                  <div className="text-xs mt-0.5">
                    {mode === "limitExceeded" && planKey === currentPlanKey
                      ? "Aktualny plan"
                      : isShorterDuration
                        ? "Krótszy okres"
                        : formatPrice(displayPrice)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="text-right ml-4">
          {selectedPlan &&
            (() => {
              const fullPrice = selectedPlan.priceCents;
              const upgradePrice =
                mode === "limitExceeded" && currentPlanPriceCents > 0
                  ? Math.max(0, fullPrice - currentPlanPriceCents)
                  : fullPrice;

              return (
                <>
                  <p className="text-3xl font-bold text-photographer-accent dark:text-photographer-accentLight">
                    {formatPrice(upgradePrice)}
                  </p>
                  {mode !== "limitExceeded" && referralDiscountPercent !== null && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      (zniżka {referralDiscountPercent}% za link polecający)
                    </p>
                  )}
                </>
              );
            })()}
        </div>
      </div>

      {/* Plan Details */}
      {selectedPlan && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-photographer-border dark:border-photographer-accent/30">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Limit oryginałów</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {formatBytes(selectedPlan.storageLimitBytes)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-photographer-border dark:border-photographer-accent/30">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Limit finalnych</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {formatBytes(selectedPlan.storageLimitBytes)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
