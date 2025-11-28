import React from "react";

import { formatPrice } from "../../../lib/format-price";
import {
  getPlanByStorageAndDuration,
  calculatePriceWithDiscount,
  getPlan,
  type Duration,
  type PlanKey,
} from "../../../lib/pricing-plans";
import Button from "../../ui/button/Button";

interface SuggestedPlanSectionProps {
  suggestedStorage: "1GB" | "3GB" | "10GB";
  selectedDuration: Duration;
  selectedPlanKey: PlanKey | null;
  selectionEnabled: boolean;
  onDurationChange: (duration: Duration) => void;
  onPlanKeyChange: (planKey: PlanKey | null) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const SuggestedPlanSection: React.FC<SuggestedPlanSectionProps> = ({
  suggestedStorage,
  selectedDuration,
  selectedPlanKey,
  selectionEnabled,
  onDurationChange,
  onPlanKeyChange,
}) => {
  // Get selected plan details
  const selectedPlan = React.useMemo(() => {
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

  return (
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
              const price = planKey ? calculatePriceWithDiscount(planKey, selectionEnabled) : 0;

              return (
                <button
                  key={duration}
                  onClick={() => {
                    onDurationChange(duration);
                    onPlanKeyChange(planKey);
                  }}
                  className={`px-4 py-2 rounded-lg transition-all font-medium ${
                    isSelected
                      ? "outline-2 outline-blue-500 outline bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "outline-2 outline-gray-300 dark:outline-gray-600 outline bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:outline-blue-300 dark:hover:outline-blue-600"
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
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">(zniżka 20%)</p>
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
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Limit oryginałów</p>
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
  );
};

