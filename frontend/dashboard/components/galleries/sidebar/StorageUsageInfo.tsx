import React from "react";

import type { PlanRecommendation } from "../../../lib/plan-types";

interface Gallery {
  galleryId: string;
  originalsBytesUsed?: number;
  finalsBytesUsed?: number;
  originalsLimitBytes?: number;
  finalsLimitBytes?: number;
  [key: string]: unknown;
}

interface StorageUsageInfoProps {
  gallery: Gallery | null;
  galleryLoading: boolean;
  orderId?: string;
  isPaid: boolean;
  optimisticBytesUsed: number | null;
  planRecommendation: PlanRecommendation | null;
  isLoadingPlanRecommendation: boolean;
}

export const StorageUsageInfo: React.FC<StorageUsageInfoProps> = ({
  gallery,
  galleryLoading,
  orderId,
  isPaid,
  optimisticBytesUsed,
  planRecommendation,
  isLoadingPlanRecommendation,
}) => {
  const formatBytes = (bytes: number | undefined | null): string => {
    if (!bytes || bytes === 0) {
      return "0.00 MB";
    }
    if (bytes < 1024 * 1024) {
      // Less than 1 MB, show in KB
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      // Less than 1 GB, show in MB
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Don't show on order pages
  if (orderId || galleryLoading || !gallery?.galleryId) {
    return null;
  }

  // Use optimistic bytes if available (instant updates), then plan recommendation, then gallery data
  const originalsBytes =
    optimisticBytesUsed !== null
      ? optimisticBytesUsed
      : (planRecommendation?.uploadedSizeBytes ??
        (gallery.originalsBytesUsed as number | undefined) ??
        0);
  const finalsBytes = (gallery.finalsBytesUsed as number | undefined) ?? 0;
  // Only show limits if gallery is paid (has a plan)
  const originalsLimit =
    isPaid &&
    (planRecommendation?.originalsLimitBytes ??
      (gallery.originalsLimitBytes as number | undefined))
      ? (planRecommendation?.originalsLimitBytes ??
        (gallery.originalsLimitBytes as number | undefined))
      : undefined;
  const finalsLimit = isPaid ? (gallery.finalsLimitBytes as number | undefined) : undefined;

  return (
    <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-800">
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Wykorzystane miejsce
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300 mb-1">
        Oryginały: {formatBytes(originalsBytes)}
        {originalsLimit !== undefined && (
          <span className="text-gray-500"> / {formatBytes(originalsLimit)}</span>
        )}
        {isLoadingPlanRecommendation && planRecommendation === null && (
          <span className="ml-2 text-xs text-gray-400">(aktualizowanie...)</span>
        )}
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300">
        Finalne: {formatBytes(finalsBytes)}
        {finalsLimit !== undefined && (
          <span className="text-gray-500"> / {formatBytes(finalsLimit)}</span>
        )}
      </div>
    </div>
  );
};

