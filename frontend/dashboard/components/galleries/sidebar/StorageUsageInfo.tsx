import { useRouter } from "next/router";
import React from "react";

import { useGallery } from "../../../hooks/queries/useGalleries";

interface StorageUsageInfoProps {
  orderId?: string;
}

export const StorageUsageInfo: React.FC<StorageUsageInfoProps> = ({ orderId }) => {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  const {
    data: currentGallery,
    isLoading: galleryLoading,
    isFetching: galleryFetching,
  } = useGallery(galleryIdForQuery);


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

  // Show subtle loading indicator when fetching (but not on initial load)
  const isUpdating = galleryFetching && !galleryLoading && currentGallery;

  return (
    <div className="flex items-center gap-4">
      {!isOrderPage && (
        <div className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1">
            Oryginały:
          </span>
          {formatBytes(originalsBytes)}
          {originalsLimit !== undefined && (
            <span className="text-gray-500"> / {formatBytes(originalsLimit)}</span>
          )}
          {isUpdating && (
            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin ml-1" />
          )}
        </div>
      )}
      <div className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1">
          Finalne:
        </span>
        {formatBytes(finalsBytes)}
        {finalsLimit !== undefined && (
          <span className="text-gray-500"> / {formatBytes(finalsLimit)}</span>
        )}
        {isUpdating && (
          <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin ml-1" />
        )}
      </div>
    </div>
  );
};
