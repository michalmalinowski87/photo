import { useCallback } from "react";

import { useDownloadStore } from "../store";

/**
 * Hook for managing zip download state
 * Uses Zustand store for state management
 *
 * @returns Object with startZipDownload, updateZipDownload, removeZipDownload
 */
export const useZipDownload = () => {
  const addDownload = useDownloadStore((state) => state.addDownload);
  const updateDownload = useDownloadStore((state) => state.updateDownload);
  const removeDownload = useDownloadStore((state) => state.removeDownload);

  const startZipDownload = useCallback(
    (orderId: string, galleryId: string): string => {
      const id = `${galleryId}-${orderId}-${Date.now()}`;
      // Remove any existing downloads for this order/gallery combination
      const currentDownloads = useDownloadStore.getState().downloads;
      Object.entries(currentDownloads).forEach(([existingId, download]) => {
        if (download.orderId === orderId && download.galleryId === galleryId) {
          removeDownload(existingId);
        }
      });
      addDownload(id, { orderId, galleryId, status: "generating" });
      return id;
    },
    [addDownload, removeDownload]
  );

  const updateZipDownload = useCallback(
    (
      id: string,
      updates: Partial<{
        status: "generating" | "downloading" | "error" | "success";
        error?: string;
      }>
    ) => {
      updateDownload(id, updates);
    },
    [updateDownload]
  );

  const removeZipDownload = useCallback(
    (id: string) => {
      removeDownload(id);
    },
    [removeDownload]
  );

  return {
    startZipDownload,
    updateZipDownload,
    removeZipDownload,
  };
};
