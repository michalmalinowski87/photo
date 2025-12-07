import { useCallback } from "react";

import { useDownloadStore } from "../store";
import { formatApiError } from "../lib/api-service";
import { useDownloadFinalZip, useDownloadZip } from "./mutations/useOrderMutations";

/**
 * Hook that provides download utility functions using React Query mutations
 * These functions handle polling, state management, and file downloads
 */
export function useDownloadUtils() {
  const downloadFinalZipMutation = useDownloadFinalZip();
  const downloadZipMutation = useDownloadZip();

  const downloadFinals = useCallback(
    (galleryId: string, orderId: string): void => {
      const { addDownload, updateDownload, removeDownload } = useDownloadStore.getState();

      // Start download progress indicator
      const downloadId = `${galleryId}-${orderId}-finals-${Date.now()}`;
      addDownload(downloadId, {
        orderId,
        galleryId,
        status: "generating",
      });

      const pollForZip = async (): Promise<void> => {
        try {
          // Use mutation to download - it handles the actual download in onSuccess
          // But we need to handle polling for 202 status, so we call the API directly
          // and use the mutation's query key for caching
          const api = await import("../lib/api-service");
          const result = await api.default.orders.downloadFinalZip(galleryId, orderId);

          // Handle 202 - ZIP is being generated
          if (result.status === 202 || result.generating) {
            updateDownload(downloadId, { status: "generating" });
            setTimeout(() => {
              void pollForZip();
            }, 2000);
            return;
          }

          // Handle successful download
          updateDownload(downloadId, { status: "downloading" });

          let blob: Blob;
          let filename: string;

          if (result.blob) {
            // Binary blob response
            blob = result.blob;
            filename = result.filename ?? `order-${orderId}-finals.zip`;
          } else if (result.zip) {
            // Base64 ZIP response (backward compatibility)
            const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
            blob = new Blob([zipBlob], { type: "application/zip" });
            filename = result.filename ?? `order-${orderId}-finals.zip`;
          } else {
            throw new Error("No ZIP data available");
          }

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          updateDownload(downloadId, { status: "success" });
          setTimeout(() => {
            removeDownload(downloadId);
          }, 3000);
        } catch (err) {
          const errorMsg = formatApiError(err);
          updateDownload(downloadId, { status: "error", error: errorMsg });
        }
      };

      void pollForZip();
    },
    [downloadFinalZipMutation]
  );

  const downloadZip = useCallback(
    (galleryId: string, orderId: string): void => {
      const { addDownload, updateDownload, removeDownload } = useDownloadStore.getState();

      // Start download progress indicator
      const downloadId = `${galleryId}-${orderId}-zip-${Date.now()}`;
      addDownload(downloadId, {
        orderId,
        galleryId,
        status: "generating",
      });

      const pollForZip = async (): Promise<void> => {
        try {
          // Use mutation to download - it handles the actual download in onSuccess
          // But we need to handle polling for 202 status, so we call the API directly
          // and use the mutation's query key for caching
          const api = await import("../lib/api-service");
          const result = await api.default.orders.downloadZip(galleryId, orderId);

          // Handle 202 - ZIP is being generated
          if (result.status === 202 || result.generating) {
            updateDownload(downloadId, { status: "generating" });
            setTimeout(() => {
              void pollForZip();
            }, 2000);
            return;
          }

          // Handle successful download
          updateDownload(downloadId, { status: "downloading" });

          let blob: Blob;
          let filename: string;

          if (result.blob) {
            // Binary blob response
            blob = result.blob;
            filename = result.filename ?? `${orderId}.zip`;
          } else if (result.zip) {
            // Base64 ZIP response (backward compatibility)
            const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
            blob = new Blob([zipBlob], { type: "application/zip" });
            filename = result.filename ?? `${orderId}.zip`;
          } else {
            throw new Error("No ZIP data available");
          }

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          updateDownload(downloadId, { status: "success" });
          setTimeout(() => {
            removeDownload(downloadId);
          }, 3000);
        } catch (err) {
          const errorMsg = formatApiError(err);
          updateDownload(downloadId, { status: "error", error: errorMsg });
        }
      };

      void pollForZip();
    },
    [downloadZipMutation]
  );

  return {
    downloadFinals,
    downloadZip,
  };
}
