import { useCallback } from "react";

import { useDownloadStore } from "../store";
import { formatApiError } from "../lib/api-service";
import { useDownloadFinalZip, useDownloadZip } from "./mutations/useOrderMutations";
import api from "../lib/api-service";

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
      const startedAt = Date.now();

      // Fetch file count before starting (optional, for display only)
      const initializeDownload = async () => {
        try {
          const finalImages = await api.orders.getFinalImages(galleryId, orderId, { limit: 1 });
          const fileCount = finalImages.totalCount ?? 0;

          addDownload(downloadId, {
            orderId,
            galleryId,
            status: "generating",
            fileCount,
            startedAt,
          });
        } catch (err) {
          // If we can't get file count, just start without it
          addDownload(downloadId, {
            orderId,
            galleryId,
            status: "generating",
            startedAt,
          });
        }
      };

      void initializeDownload().then(() => {
        const pollForZip = async (): Promise<void> => {
          try {
            // Use mutation to download - it handles the actual download in onSuccess
            // But we need to handle polling for 202 status, so we call the API directly
            // and use the mutation's query key for caching
            const result = await api.orders.downloadFinalZip(galleryId, orderId);

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

            if (!result.url) {
              throw new Error("No ZIP URL available");
            }

            const filename = result.filename ?? `order-${orderId}-finals.zip`;

            // Trigger download using presigned URL
            const a = document.createElement("a");
            a.href = result.url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
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
      });
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

          if (!result.url) {
            throw new Error("No ZIP URL available");
          }

          const filename = result.filename ?? `${orderId}.zip`;

          // Trigger download using presigned URL
          const a = document.createElement("a");
          a.href = result.url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
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
