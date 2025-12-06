import { StateCreator } from "zustand";

import api, { formatApiError } from "../lib/api-service";

export interface Order {
  orderId: string;
  galleryId: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  selectedCount?: number;
  overageCents?: number;
  [key: string]: any;
}

export interface OrderSlice {
  // Loading states for order actions
  denyLoading: boolean;
  // Download actions - these will be moved to utility file or hook later
  downloadFinals: (galleryId: string, orderId: string) => Promise<void>;
  downloadZip: (galleryId: string, orderId: string) => Promise<void>;
}

export const createOrderSlice: StateCreator<
  OrderSlice,
  [["zustand/devtools", never]],
  [],
  OrderSlice
> = () => ({
  denyLoading: false,

  downloadFinals: async (galleryId: string, orderId: string) => {
    const { useDownloadStore } = await import("./hooks");
    const { addDownload, updateDownload, removeDownload } = useDownloadStore.getState();

    // Start download progress indicator
    const downloadId = `${galleryId}-${orderId}-${Date.now()}`;
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
            pollForZip();
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
          filename = result.filename || `order-${orderId}-finals.zip`;
        } else if (result.zip) {
          // Base64 ZIP response (backward compatibility)
          const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
          blob = new Blob([zipBlob], { type: "application/zip" });
          filename = result.filename || `order-${orderId}-finals.zip`;
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

    pollForZip();
  },

  downloadZip: async (galleryId: string, orderId: string) => {
    const { useDownloadStore } = await import("./hooks");
    const { addDownload, updateDownload, removeDownload } = useDownloadStore.getState();

    // Start download progress indicator
    const downloadId = `${galleryId}-${orderId}-${Date.now()}`;
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
            pollForZip();
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
          filename = result.filename || `${orderId}.zip`;
        } else if (result.zip) {
          // Base64 ZIP response (backward compatibility)
          const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
          blob = new Blob([zipBlob], { type: "application/zip" });
          filename = result.filename || `${orderId}.zip`;
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

    pollForZip();
  },
});
