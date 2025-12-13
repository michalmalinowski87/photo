import { QueryClient } from "@tanstack/react-query";

import { useDownloadStore } from "../store";

import api, { formatApiError } from "./api-service";
import { queryKeys } from "./react-query";

/**
 * Download final images ZIP for an order
 * Tracks download progress in Zustand (UI state)
 *
 * @param galleryId - Gallery ID
 * @param orderId - Order ID
 * @param queryClient - Optional React Query client for caching (if available)
 * @deprecated Use useDownloadUtils hook instead for React Query integration
 */
export function downloadFinals(
  galleryId: string,
  orderId: string,
  queryClient?: QueryClient
): void {
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
      // Use React Query for caching if available
      const result = queryClient
        ? await queryClient.fetchQuery({
            queryKey: [...queryKeys.orders.detail(galleryId, orderId), "final-zip"],
            queryFn: () => api.orders.downloadFinalZip(galleryId, orderId),
          })
        : await api.orders.downloadFinalZip(galleryId, orderId);

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
}

/**
 * Download original images ZIP for an order
 * Tracks download progress in Zustand (UI state)
 *
 * @param galleryId - Gallery ID
 * @param orderId - Order ID
 * @param queryClient - Optional React Query client for caching (if available)
 * @deprecated Use useDownloadUtils hook instead for React Query integration
 */
export function downloadZip(galleryId: string, orderId: string, queryClient?: QueryClient): void {
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
      // Use React Query for caching if available
      const result = queryClient
        ? await queryClient.fetchQuery({
            queryKey: [...queryKeys.orders.detail(galleryId, orderId), "zip"],
            queryFn: () => api.orders.downloadZip(galleryId, orderId),
          })
        : await api.orders.downloadZip(galleryId, orderId);

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
}
