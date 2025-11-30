import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useDownloadStore } from "../../../store/downloadSlice";

import { ZipDownloadProgress } from "./ZipDownloadProgress";

/**
 * ZipDownloadContainer component that renders download progress from Zustand store
 * This replaces the ZipDownloadProvider context component
 */
export const ZipDownloadContainer: React.FC = () => {
  const downloads = useDownloadStore((state) => state.downloads);
  const removeDownload = useDownloadStore((state) => state.removeDownload);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const downloadItems = Object.values(downloads);

  if (!mounted || typeof window === "undefined" || downloadItems.length === 0) {
    return null;
  }

  return createPortal(
    <div
      className="flex flex-col gap-2 pointer-events-none"
      style={
        {
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: 2147483646, // Very high z-index to ensure it's above everything
          pointerEvents: "none",
        } as React.CSSProperties
      }
    >
      {downloadItems.map((download) => (
        <div key={download.id} className="pointer-events-auto" style={{ pointerEvents: "auto" }}>
          <ZipDownloadProgress
            orderId={download.orderId}
            galleryId={download.galleryId}
            status={download.status}
            error={download.error}
            onDismiss={() => removeDownload(download.id)}
          />
        </div>
      ))}
    </div>,
    document.body
  );
};
