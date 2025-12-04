import React from "react";

import { useGalleryStore } from "../../../store";

interface StorageUsageInfoProps {
  orderId?: string;
}

export const StorageUsageInfo: React.FC<StorageUsageInfoProps> = ({ orderId }) => {
  const currentGallery = useGalleryStore((state) => state.currentGallery);
  const galleryLoading = useGalleryStore((state) => state.isLoading);

  const isPaid = currentGallery?.isPaid ?? false;
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

  // Don't show if gallery is loading or not available
  if (galleryLoading || !currentGallery?.galleryId) {
    return null;
  }

  const originalsBytes =
    typeof currentGallery.originalsBytesUsed === "number" ? currentGallery.originalsBytesUsed : 0;
  const finalsBytes =
    typeof currentGallery.finalsBytesUsed === "number" ? currentGallery.finalsBytesUsed : 0;
  // Only show limits if gallery is paid (has a plan)
  const originalsLimit =
    isPaid && typeof currentGallery.originalsLimitBytes === "number"
      ? currentGallery.originalsLimitBytes
      : undefined;
  const finalsLimit =
    isPaid && typeof currentGallery.finalsLimitBytes === "number"
      ? currentGallery.finalsLimitBytes
      : undefined;

  // On order pages, only show finals
  const isOrderPage = !!orderId;

  return (
    <div className="flex items-center gap-4">
      {!isOrderPage && (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1">
            Oryginały:
          </span>
          {formatBytes(originalsBytes)}
          {originalsLimit !== undefined && (
            <span className="text-gray-500"> / {formatBytes(originalsLimit)}</span>
          )}
        </div>
      )}
      <div className="text-sm text-gray-700 dark:text-gray-300">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1">
          Finalne:
        </span>
        {formatBytes(finalsBytes)}
        {finalsLimit !== undefined && (
          <span className="text-gray-500"> / {formatBytes(finalsLimit)}</span>
        )}
      </div>
    </div>
  );
};
