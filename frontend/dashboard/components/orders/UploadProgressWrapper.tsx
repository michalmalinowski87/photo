import { useState, useEffect } from "react";

import { UploadProgressOverlay, type PerImageProgress } from "../upload/UploadProgressOverlay";

interface UploadProgressWrapperProps {
  handlerPerImageProgress: PerImageProgress[];
  perImageProgress: PerImageProgress[];
  isUploadComplete: boolean;
}

export const UploadProgressWrapper = ({
  handlerPerImageProgress,
  perImageProgress,
  isUploadComplete,
}: UploadProgressWrapperProps) => {
  const [isOverlayDismissed, setIsOverlayDismissed] = useState(false);

  useEffect(() => {
    // Reset dismissed state when new upload starts
    if (
      handlerPerImageProgress.length > 0 &&
      handlerPerImageProgress.some((p) => p.status === "uploading")
    ) {
      setIsOverlayDismissed(false);
    }
  }, [handlerPerImageProgress]);

  const currentProgress =
    handlerPerImageProgress.length > 0 ? handlerPerImageProgress : perImageProgress;

  if (currentProgress.length === 0 || isOverlayDismissed) {
    return null;
  }

  return (
    <UploadProgressOverlay
      images={currentProgress}
      isUploadComplete={isUploadComplete}
      onDismiss={() => {
        setIsOverlayDismissed(true);
      }}
    />
  );
};
