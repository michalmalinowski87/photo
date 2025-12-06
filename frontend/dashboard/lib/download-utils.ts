import { useDownloadStore } from "../store";

import api, { formatApiError } from "./api-service";

/**
 * Download final images ZIP for an order
 * Tracks download progress in Zustand (UI state)
 *
 * @param galleryId - Gallery ID
 * @param orderId - Order ID
 */
export function downloadFinals(galleryId: string, orderId: string): void {
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
}

/**
 * Download original images ZIP for an order
 * Tracks download progress in Zustand (UI state)
 *
 * @param galleryId - Gallery ID
 * @param orderId - Order ID
 */
export function downloadZip(galleryId: string, orderId: string): void {
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
      const result = await api.orders.downloadZip(galleryId, orderId);

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
}
