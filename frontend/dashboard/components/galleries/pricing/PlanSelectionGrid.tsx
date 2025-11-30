import React from "react";

import { formatPrice } from "../../../lib/format-price";
import { calculatePhotoEstimateFromStorage } from "../../../lib/photo-estimates";
import {
  getAllPlansGroupedByStorage,
  getPlanByStorageAndDuration,
  calculatePriceWithDiscount,
  getPlan,
  type Duration,
  type PlanKey,
} from "../../../lib/pricing-plans";

interface PlanSelectionGridProps {
  suggestedStorage: "1GB" | "3GB" | "10GB";
  selectedDuration: Duration;
  selectedPlanKey: PlanKey | null;
  selectionEnabled: boolean;
  onDurationChange: (duration: Duration) => void;
  onPlanKeyChange: (planKey: PlanKey) => void;
}

export const PlanSelectionGrid: React.FC<PlanSelectionGridProps> = ({
  suggestedStorage,
  selectedDuration,
  selectedPlanKey,
  selectionEnabled,
  onDurationChange,
  onPlanKeyChange,
}) => {
  // Get all plans grouped by storage
  const allPlans = React.useMemo(() => getAllPlansGroupedByStorage(), []);

  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Wszystkie dostępne plany
      </h3>

      {/* Duration Toggle */}
      <div className="flex items-center justify-center gap-2 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        {(["1m", "3m", "12m"] as Duration[]).map((duration) => {
          const isSelected = selectedDuration === duration;
          return (
            <button
              key={duration}
              onClick={() => {
                onDurationChange(duration);
                // Update selected plan to match the suggested storage with new duration
                const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
                if (planKey) {
                  onPlanKeyChange(planKey);
                }
              }}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                isSelected
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {duration === "1m" ? "1 miesiąc" : duration === "3m" ? "3 miesiące" : "12 miesięcy"}
            </button>
          );
        })}
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-3 gap-4">
        {allPlans.map(({ storage, plans }) => {
          // Get the plan for current storage and selected duration
          const planForDuration = plans.find((p) => p.duration === selectedDuration);
          if (!planForDuration) {
            return null;
          }

          const planKey = planForDuration.planKey;
          const plan = getPlan(planKey);
          if (!plan) {
            return null;
          }

          const price = calculatePriceWithDiscount(planKey, selectionEnabled);
          const isSuggested = suggestedStorage === storage;
          const isSelected = selectedPlanKey === planKey || (isSuggested && !selectedPlanKey);

          // Calculate photo estimates using utility function
          const photoEstimate = calculatePhotoEstimateFromStorage(storage);

          return (
            <div
              key={storage}
              onClick={() => {
                // Just update the selected plan - duration is already correct
                // since we only show plans for the selected duration
                onPlanKeyChange(planKey);
              }}
              className={`relative rounded-lg border-2 p-5 cursor-pointer transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-600"
              }`}
            >
              {/* Suggested Badge */}
              {isSuggested && (
                <div className="absolute top-3 right-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Sugerowany
                  </span>
                </div>
              )}

              {/* Selected Checkmark */}
              {isSelected && !isSuggested && (
                <div className="absolute top-3 right-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>
              )}

              <div className="mb-2">
                <h4 className="text-xl font-bold text-gray-900 dark:text-white">{storage}</h4>
                <div className="mt-1 flex items-center gap-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {photoEstimate.displayText}
                  </p>
                  <div className="group relative">
                    <svg
                      className="w-3 h-3 text-gray-400 dark:text-gray-500 cursor-help"
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
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                      {photoEstimate.tooltipText}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatPrice(price)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">/ miesiąc</div>
                {!selectionEnabled && (
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">Zniżka 20%</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <svg
                    className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Galeria chroniona hasłem</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <svg
                    className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Wybór zdjęć przez klienta</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <svg
                    className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Wsparcie techniczne</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
