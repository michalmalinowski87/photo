import React, { useMemo } from "react";

import { useBottomRightOverlay } from "../../hooks/useBottomRightOverlay";

import { CompletedItemsSection } from "./CompletedItemsSection";
import { ProcessingCounter } from "./ProcessingCounter";
import { UploadErrorsSection } from "./UploadErrorsSection";
import { UploadingItemsList } from "./UploadingItemsList";
import { UploadProgressBar } from "./UploadProgressBar";
import { UploadProgressHeader } from "./UploadProgressHeader";

export interface PerImageProgress {
  fileName: string;
  status: "uploading" | "processing" | "ready" | "error";
  uploadProgress?: number; // 0-100 for upload progress
  error?: string;
}

interface UploadProgressOverlayProps {
  images: PerImageProgress[];
  onDismiss?: () => void;
  isUploadComplete?: boolean; // Whether upload phase is complete (now processing)
}

export const UploadProgressOverlay: React.FC<UploadProgressOverlayProps> = ({
  images,
  onDismiss,
  isUploadComplete = false,
}) => {
  const maxUploadItems = 5; // Show up to 5 items with upload progress bars

  // Get positioning from context (optional - may not be available)
  const overlayContext = useBottomRightOverlay();
  const rightOffset = useMemo(() => {
    if (!overlayContext?.nextStepsVisible) {
      return "1rem"; // Default: right-4
    }

    // Calculate offset based on NextStepsOverlay state
    const nextStepsCurrentWidth = overlayContext.nextStepsExpanded
      ? overlayContext.nextStepsWidth
      : overlayContext.nextStepsCollapsedWidth;
    // Add gap (1.5rem = 24px for better spacing) + next steps width
    const offsetPx = 24 + nextStepsCurrentWidth;
    return `${offsetPx}px`;
  }, [
    overlayContext?.nextStepsVisible,
    overlayContext?.nextStepsExpanded,
    overlayContext?.nextStepsWidth,
    overlayContext?.nextStepsCollapsedWidth,
  ]);

  // Separate images by status - hooks must be called unconditionally
  const uploadingImages = useMemo(() => {
    if (images.length === 0) {
      return [];
    }
    // Show first 5 items that are uploading (with progress bars)
    return images.filter((img) => img.status === "uploading").slice(0, maxUploadItems);
  }, [images, maxUploadItems]);

  const processingCount = useMemo(() => {
    if (images.length === 0) {
      return 0;
    }
    // Count all items in processing (no individual bars, just counter)
    return images.filter((img) => img.status === "processing").length;
  }, [images]);

  const completedImages = useMemo(() => {
    if (images.length === 0) {
      return [];
    }
    return images.filter((img) => img.status === "ready");
  }, [images]);

  const errorImages = useMemo(() => {
    if (images.length === 0) {
      return [];
    }
    return images.filter((img) => img.status === "error");
  }, [images]);

  if (images.length === 0) {
    return null;
  }

  const readyCount = completedImages.length;
  const errorCount = errorImages.length;
  const total = images.length;
  const allComplete = readyCount + errorCount === total;

  // Calculate overall progress
  // During upload: show 50% max, after upload complete: show 100% (processing phase)
  const uploadProgress = total > 0 ? Math.round(((readyCount + errorCount) / total) * 50) : 0;
  const overallProgress = isUploadComplete ? 100 : Math.min(uploadProgress, 50);

  return (
    <div
      className="fixed bottom-4 z-50 w-96 max-w-[calc(100vw-2rem)]"
      style={{ right: rightOffset }}
    >
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        <UploadProgressHeader
          allComplete={allComplete}
          isUploadComplete={isUploadComplete}
          uploadingCount={uploadingImages.length}
          processingCount={processingCount}
          readyCount={readyCount}
          errorCount={errorCount}
          total={total}
          onDismiss={onDismiss}
        />

        {!allComplete && (
          <UploadProgressBar
            overallProgress={overallProgress}
            isUploadComplete={isUploadComplete}
          />
        )}

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          <UploadingItemsList images={uploadingImages} />
          <ProcessingCounter count={processingCount} />
          <UploadErrorsSection errorImages={errorImages} />
          <CompletedItemsSection completedImages={completedImages} />
        </div>
      </div>
    </div>
  );
};
