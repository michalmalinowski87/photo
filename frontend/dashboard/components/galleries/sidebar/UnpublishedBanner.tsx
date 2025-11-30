import { useRouter } from "next/router";
import React from "react";

import { formatPrice } from "../../../lib/format-price";
import type { PlanRecommendation } from "../../../lib/plan-types";
import Button from "../../ui/button/Button";

interface Gallery {
  galleryId: string;
  originalsBytesUsed?: number;
  [key: string]: unknown;
}

interface UnpublishedBannerProps {
  gallery: Gallery | null;
  galleryLoading: boolean;
  isPaid: boolean;
  shouldHideSecondaryElements: boolean;
  optimisticBytesUsed: number | null;
  planRecommendation: PlanRecommendation | null;
  isLoadingPlanRecommendation: boolean;
  onPay: () => void;
}

export const UnpublishedBanner: React.FC<UnpublishedBannerProps> = ({
  gallery,
  galleryLoading,
  isPaid,
  shouldHideSecondaryElements,
  optimisticBytesUsed,
  planRecommendation,
  isLoadingPlanRecommendation,
  onPay,
}) => {
  const router = useRouter();

  const formatBytes = (bytes: number | undefined | null): string => {
    if (!bytes || bytes === 0) {
      return "0 GB";
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (galleryLoading || !gallery?.galleryId || isPaid || shouldHideSecondaryElements) {
    return null;
  }

  // Use optimistic bytes if available (instant updates), then plan recommendation, then gallery data
  // This ensures we show the correct state immediately on upload/delete
  // IMPORTANT: Don't use gallery.originalsBytesUsed until loading is complete to prevent flicker
  const currentUploadedBytes =
    optimisticBytesUsed ??
    (isLoadingPlanRecommendation
      ? (planRecommendation?.uploadedSizeBytes ?? gallery.originalsBytesUsed ?? 0) // Keep previous value while loading
      : (planRecommendation?.uploadedSizeBytes ?? gallery.originalsBytesUsed ?? 0));
  // Only show plan content if we're not loading AND we have a plan recommendation
  const hasUploadedPhotos =
    !isLoadingPlanRecommendation && currentUploadedBytes > 0 && planRecommendation !== null;

  return (
    <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-800">
      <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
        <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
          Galeria nieopublikowana
        </div>

        {/* Content container - uses grid to maintain stable layout, both states always in flow */}
        {/* min-h ensures stable height even when content changes */}
        <div className="grid grid-cols-1 min-h-[120px]">
          {/* State 1: No photos uploaded - Always rendered, visibility controlled by opacity and visibility */}
          <div
            className={`col-start-1 row-start-1 transition-opacity duration-300 ${
              !hasUploadedPhotos
                ? "opacity-100 pointer-events-auto visible"
                : "opacity-0 pointer-events-none invisible"
            }`}
          >
            <div className="text-xs text-warning-600 dark:text-warning-400 mb-2">
              Prześlij zdjęcia, aby system mógł wybrać optymalny plan dla Twojej galerii.
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => router.push(`/galleries/${gallery.galleryId}/photos`)}
              className="w-full"
            >
              Przejdź do zdjęć
            </Button>
          </div>

          {/* State 2: Has photos with plan recommendation - Always rendered, visibility controlled by opacity and visibility */}
          <div
            className={`col-start-1 row-start-1 transition-opacity duration-300 ${
              hasUploadedPhotos
                ? "opacity-100 pointer-events-auto visible"
                : "opacity-0 pointer-events-none invisible"
            }`}
          >
            <div className="text-xs text-warning-600 dark:text-warning-400 mb-2">
              System zaproponował plan na podstawie przesłanych zdjęć.
            </div>

            {/* Space Usage & Plan - Compact */}
            <div className="bg-white dark:bg-gray-800 rounded p-2 mb-2 border border-warning-200 dark:border-warning-500/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600 dark:text-gray-400">Wykorzystane:</span>
                <span className="text-xs font-semibold text-warning-600 dark:text-warning-400">
                  {formatBytes(currentUploadedBytes)}
                </span>
              </div>
              {planRecommendation ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Plan:</span>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {planRecommendation.suggestedPlan.name} (
                    {formatPrice(planRecommendation.suggestedPlan.priceCents)})
                  </span>
                </div>
              ) : isLoadingPlanRecommendation ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                  Obliczanie...
                </div>
              ) : null}
            </div>

            <Button size="sm" variant="primary" onClick={onPay} className="w-full">
              Opublikuj galerię
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
