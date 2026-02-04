import { PostHogActions } from "@photocloud/posthog-types";
import { CheckCircle2, Check, Info } from "lucide-react";
import React from "react";

import { formatPrice } from "../../../lib/format-price";
import { calculatePhotoEstimateFromStorage } from "../../../lib/photo-estimates";
import {
  getAllPlansGroupedByStorage,
  getPlanByStorageAndDuration,
  calculatePriceWithReferralDiscount,
  getPlan,
  type Duration,
  type PlanKey,
} from "../../../lib/pricing-plans";
import { Tooltip } from "../../ui/tooltip/Tooltip";

interface PlanSelectionGridProps {
  suggestedStorage: "1GB" | "3GB" | "10GB";
  selectedDuration: Duration;
  selectedPlanKey: PlanKey | null;
  selectionEnabled: boolean;
  onDurationChange: (duration: Duration) => void;
  onPlanKeyChange: (planKey: PlanKey) => void;
  disabledPlanSizes?: ("1GB" | "3GB" | "10GB")[];
  mode?: "publish" | "limitExceeded";
  currentPlanKey?: string;
  currentPlanPriceCents?: number;
  /** When set (10 or 15), show referral discount label. */
  referralDiscountPercent?: 10 | 15;
}

export const PlanSelectionGrid = ({
  suggestedStorage,
  selectedDuration,
  selectedPlanKey,
  selectionEnabled: _selectionEnabled,
  onDurationChange,
  onPlanKeyChange,
  disabledPlanSizes = [],
  mode = "publish",
  currentPlanKey,
  currentPlanPriceCents = 0,
  referralDiscountPercent,
}: PlanSelectionGridProps) => {
  // Get all plans grouped by storage
  const allPlans = React.useMemo(() => getAllPlansGroupedByStorage(), []);

  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Wszystkie dostępne plany
      </h3>

      {/* Duration Toggle */}
      <div className="flex items-center justify-center gap-2 mb-6 p-1 bg-photographer-elevated dark:bg-gray-800 rounded-lg">
        {(["1m", "3m", "12m"] as Duration[]).map((duration) => {
          const isSelected = selectedDuration === duration;

          // Check if this duration is shorter than current plan duration
          const isShorterDuration =
            mode === "limitExceeded" && currentPlanKey
              ? (() => {
                  const currentPlan = getPlan(currentPlanKey as PlanKey);
                  if (currentPlan) {
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

          const isDisabled = mode === "limitExceeded" && isShorterDuration;

          return (
            <button
              key={duration}
              onClick={() => {
                if (!isDisabled) {
                  onDurationChange(duration);
                  // Update selected plan to match the suggested storage with new duration
                  const planKey = getPlanByStorageAndDuration(suggestedStorage, duration);
                  if (planKey) {
                    onPlanKeyChange(planKey);
                  }
                }
              }}
              disabled={isDisabled}
              data-ph-action={PostHogActions.payment.durationSelect}
              data-ph-property-duration={duration}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                isDisabled
                  ? "opacity-50 cursor-not-allowed text-gray-400 dark:text-gray-600"
                  : isSelected
                    ? "bg-photographer-accentLight/60 dark:bg-photographer-accentDark/30 text-photographer-accentDark dark:text-gray-300 shadow-sm border border-photographer-darkBeige/50 dark:border-photographer-accent/40"
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

          const fullPrice = calculatePriceWithReferralDiscount(planKey, referralDiscountPercent);
          // For upgrades, calculate the upgrade price (difference)
          const upgradePrice =
            mode === "limitExceeded" && currentPlanPriceCents > 0
              ? Math.max(0, fullPrice - currentPlanPriceCents)
              : fullPrice;
          const displayPrice =
            mode === "limitExceeded" && planKey === currentPlanKey
              ? 0 // Current plan - no upgrade needed
              : upgradePrice;

          const isSuggested = suggestedStorage === storage;
          const isSelected = selectedPlanKey === planKey || (isSuggested && !selectedPlanKey);
          const isDisabled =
            disabledPlanSizes.includes(storage) ||
            (mode === "limitExceeded" && planKey === currentPlanKey);

          // Calculate photo estimates using utility function
          const photoEstimate = calculatePhotoEstimateFromStorage(storage);

          return (
            <Tooltip
              key={storage}
              content={isDisabled ? "Ten plan jest już aktywny. Wybierz większy plan." : undefined}
              side="top"
              maxWidth="16rem"
            >
              <div
                onClick={() => {
                  if (isDisabled) {
                    return;
                  }
                  // Just update the selected plan - duration is already correct
                  // since we only show plans for the selected duration
                  onPlanKeyChange(planKey);
                }}
                data-ph-action={PostHogActions.payment.planCardClick}
                data-ph-property-plan_key={planKey}
                className={`relative rounded-lg border-2 p-5 transition-all ${
                  isDisabled
                    ? "opacity-50 cursor-not-allowed border-gray-400 dark:border-gray-600 bg-photographer-background dark:bg-gray-900"
                    : isSelected
                      ? "border-photographer-accent/60 bg-photographer-elevated dark:bg-photographer-accentDark/20 shadow-md cursor-pointer"
                      : "border-gray-400 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-photographer-darkBeige dark:hover:border-photographer-accent cursor-pointer"
                }`}
              >
                {/* Suggested Badge */}
                {isSuggested && (
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-photographer-accentLight dark:bg-photographer-accentDark/40 text-xs font-semibold text-photographer-accentDark/80 dark:text-photographer-accentLight">
                      <CheckCircle2 size={12} />
                      Sugerowany
                    </span>
                  </div>
                )}

                {/* Selected Checkmark */}
                {isSelected && !isSuggested && (
                  <div className="absolute top-3 right-3">
                    <div className="w-6 h-6 rounded-full bg-photographer-accent flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" strokeWidth={2} />
                    </div>
                  </div>
                )}

                <div className="mb-2">
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white">{storage}</h4>
                  <div className="mt-1 flex items-center gap-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {photoEstimate.displayText}
                    </p>
                    <Tooltip content={photoEstimate.tooltipText} side="top" maxWidth="16rem">
                      <Info
                        size={12}
                        className="text-gray-400 dark:text-gray-500 cursor-help"
                        strokeWidth={2}
                      />
                    </Tooltip>
                  </div>
                </div>

                <div className="mb-4">
                  {mode === "limitExceeded" &&
                  planKey !== currentPlanKey &&
                  currentPlanPriceCents > 0 ? (
                    <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatPrice(displayPrice)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        ({formatPrice(fullPrice)} - {formatPrice(currentPlanPriceCents)})
                      </div>
                    </div>
                  ) : mode === "limitExceeded" && planKey === currentPlanKey ? (
                    <div>
                      <div className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                        Aktualny plan
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatPrice(fullPrice)} / miesiąc
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatPrice(displayPrice)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">/ miesiąc</div>
                      {mode !== "limitExceeded" && referralDiscountPercent !== undefined && (
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Zniżka {referralDiscountPercent}% za link polecający
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle2
                      size={16}
                      className="text-photographer-accent dark:text-photographer-accentLight flex-shrink-0"
                    />
                    <span>Galeria chroniona hasłem</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle2
                      size={16}
                      className="text-photographer-accent dark:text-photographer-accentLight flex-shrink-0"
                    />
                    <span>Wybór zdjęć przez klienta</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle2
                      size={16}
                      className="text-photographer-accent dark:text-photographer-accentLight flex-shrink-0"
                    />
                    <span>Wsparcie techniczne</span>
                  </div>
                </div>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};
