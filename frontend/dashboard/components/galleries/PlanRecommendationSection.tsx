import { formatPrice } from "../../lib/format-price";
import type { PlanRecommendation } from "../../lib/plan-types";
import {
  getPlanByStorageAndDuration,
  calculatePriceWithDiscount,
  type Duration,
} from "../../lib/pricing-plans";

interface PlanRecommendationSectionProps {
  planRecommendation: PlanRecommendation | null;
  isLoading: boolean;
  uploadedSizeBytes: number | null;
  selectedDuration: Duration | null;
  setSelectedDuration: (duration: Duration) => void;
  selectionEnabled: boolean;
}

export const PlanRecommendationSection: React.FC<PlanRecommendationSectionProps> = ({
  planRecommendation,
  isLoading,
  uploadedSizeBytes,
  selectedDuration,
  setSelectedDuration,
  selectionEnabled,
}) => {
  const formatBytes = (bytes: number | undefined | null): string => {
    if (!bytes || bytes === 0) {
      return "0 GB";
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const currentUploadedBytes = uploadedSizeBytes ?? 0;

  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="w-5 h-5 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Zaproponowany plan
            </span>
          </div>
          {planRecommendation ? (
            <>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {planRecommendation.suggestedPlan.name.split(" - ")[0]}
              </h4>

              {/* Duration Selector */}
              <div className="flex gap-2">
                {(["1m", "3m", "12m"] as Duration[]).map((duration) => {
                  const isSelected = (selectedDuration ?? "1m") === duration;

                  return (
                    <button
                      key={duration}
                      onClick={() => setSelectedDuration(duration)}
                      className={`px-3 py-1.5 rounded-md transition-all text-sm font-medium ${
                        isSelected
                          ? "outline-2 outline-blue-500 outline bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : "outline-2 outline-gray-300 dark:outline-gray-600 outline bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:outline-blue-300 dark:hover:outline-blue-600"
                      }`}
                    >
                      {duration === "1m"
                        ? "1 miesiąc"
                        : duration === "3m"
                          ? "3 miesiące"
                          : "12 miesięcy"}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h4 className="text-lg font-semibold text-gray-400 dark:text-gray-500 mb-3">-</h4>
              <div className="flex gap-2">
                {(["1m", "3m", "12m"] as Duration[]).map((duration) => (
                  <div
                    key={duration}
                    className="px-3 py-1.5 rounded-md border-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 text-sm"
                  >
                    {duration === "1m"
                      ? "1 miesiąc"
                      : duration === "3m"
                        ? "3 miesiące"
                        : "12 miesięcy"}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="text-right">
          {isLoading ? (
            <div className="text-3xl font-bold text-gray-400 dark:text-gray-500">
              Kalkulowanie...
            </div>
          ) : planRecommendation ? (
            <>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                {(() => {
                  // Calculate price for selected duration
                  const storageMatch = planRecommendation.suggestedPlan.name.match(/^(\d+GB)/);
                  const storage = (storageMatch ? storageMatch[1] : "1GB") as
                    | "1GB"
                    | "3GB"
                    | "10GB";
                  const currentDuration = selectedDuration ?? "1m";
                  const planKey = getPlanByStorageAndDuration(storage, currentDuration);
                  if (planKey) {
                    return formatPrice(calculatePriceWithDiscount(planKey, selectionEnabled));
                  }
                  return formatPrice(planRecommendation.suggestedPlan.priceCents);
                })()}
              </div>
              {!selectionEnabled && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-green-100 dark:bg-green-900/30 text-xs font-medium text-green-700 dark:text-green-400">
                  Zniżka 20%
                </span>
              )}
            </>
          ) : (
            <div className="text-3xl font-bold text-gray-400 dark:text-gray-500">-</div>
          )}
        </div>
      </div>

      {/* Storage Usage and Limits */}
      {planRecommendation && (
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Wykorzystane miejsce
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatBytes(currentUploadedBytes)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Limit oryginałów
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatBytes(planRecommendation.originalsLimitBytes)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Limit finalnych
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatBytes(planRecommendation.finalsLimitBytes)}
            </p>
          </div>
        </div>
      )}

      {/* Usage Indicator */}
      {planRecommendation?.usagePercentage !== undefined && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Wykorzystanie pojemności
            </span>
            <span
              className={`text-sm font-semibold ${
                planRecommendation.isNearCapacity
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-gray-900 dark:text-white"
              }`}
            >
              {planRecommendation.usagePercentage.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                planRecommendation.isNearCapacity
                  ? "bg-amber-500 dark:bg-amber-400"
                  : "bg-blue-600 dark:bg-blue-500"
              }`}
              style={{
                width: `${Math.min(planRecommendation.usagePercentage, 100)}%`,
              }}
            />
          </div>
          {planRecommendation.isNearCapacity && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Galeria jest prawie pełna. Rozważ wybór większego planu.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
