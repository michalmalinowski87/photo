import React, { ComponentType, useCallback } from "react";

import api, { formatApiError } from "../lib/api-service";
import { useDownloadStore } from "../store";

interface ZipDownloadConfig {
  apiUrl: string;
  galleryId: string;
  orderId: string;
  endpoint?: string; // Optional custom endpoint, defaults to standard order zip endpoint
  filename?: string; // Optional custom filename
}

interface WithZipDownloadProps {
  onDownloadZip?: () => void;
  downloadZipLoading?: boolean;
}

/**
 * HOC that provides unified ZIP download functionality
 * Handles polling, progress tracking, and error handling
 *
 * @param WrappedComponent - Component to wrap
 * @returns Component with downloadZip prop
 */
export function withZipDownload<P extends object>(
  WrappedComponent: ComponentType<P & WithZipDownloadProps>
) {
  return function ZipDownloadComponent(props: P & { config?: ZipDownloadConfig }) {
    const { addDownload, updateDownload, removeDownload } = useDownloadStore();

    const downloadZip = useCallback(
      async (config: ZipDownloadConfig) => {
        const {
          apiUrl,
          galleryId,
          orderId,
          endpoint = `${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`,
          filename = `${orderId}.zip`,
        } = config;

        if (!apiUrl || !galleryId || !orderId) {
          return;
        }

        // Start download progress indicator
        const downloadId = `${galleryId}-${orderId}-${Date.now()}`;
        addDownload(downloadId, {
          orderId,
          galleryId,
          status: "generating",
        });

        const pollForZip = async (): Promise<void> => {
          try {
            // Determine which API method to use based on endpoint
            const isFinalZip = endpoint.includes("/final/zip");
            const result = isFinalZip
              ? await api.orders.downloadFinalZip(galleryId, orderId)
              : await api.orders.downloadZip(galleryId, orderId);

            // Handle 202 - ZIP is being generated
            if (result.status === 202 || result.generating) {
              updateDownload(downloadId, { status: "generating" });
              // Retry after delay
              setTimeout(() => {
                pollForZip();
              }, 2000); // Poll every 2 seconds
              return;
            }

            // Handle successful download
            updateDownload(downloadId, { status: "downloading" });

            let blob: Blob;
            let finalFilename: string;

            if (result.blob) {
              // Binary blob response
              blob = result.blob;
              finalFilename = result.filename || filename;
            } else if (result.zip) {
              // Base64 ZIP response (backward compatibility)
              const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
              blob = new Blob([zipBlob], { type: "application/zip" });
              finalFilename = result.filename || filename;
            } else {
              throw new Error("No ZIP data available");
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = finalFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            updateDownload(downloadId, { status: "success" });
            // Auto-dismiss after 3 seconds
            setTimeout(() => {
              removeDownload(downloadId);
            }, 3000);
          } catch (err) {
            const errorMsg = formatApiError(err);
            updateDownload(downloadId, { status: "error", error: errorMsg });
          }
        };

        // Start polling
        pollForZip();
      },
      [addDownload, updateDownload, removeDownload]
    );

    // Pass downloadZip function to wrapped component
    return <WrappedComponent {...(props as P)} downloadZip={downloadZip} />;
  };
}

/**
 * Hook version for direct use in components
 */
export function useZipDownload() {
  const { addDownload, updateDownload, removeDownload } = useDownloadStore();

  const downloadZip = useCallback(
    async (config: ZipDownloadConfig) => {
      const {
        apiUrl,
        galleryId,
        orderId,
        endpoint = `${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`,
        filename = `${orderId}.zip`,
      } = config;

      if (!apiUrl || !galleryId || !orderId) {
        return;
      }

      // Start download progress indicator
      const downloadId = `${galleryId}-${orderId}-${Date.now()}`;
      addDownload(downloadId, {
        orderId,
        galleryId,
        status: "generating",
      });

      const pollForZip = async (): Promise<void> => {
        try {
          // Determine which API method to use based on endpoint
          const isFinalZip = endpoint.includes("/final/zip");
          const result = isFinalZip
            ? await api.orders.downloadFinalZip(galleryId, orderId)
            : await api.orders.downloadZip(galleryId, orderId);

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
          let finalFilename: string;

          if (result.blob) {
            // Binary blob response
            blob = result.blob;
            finalFilename = result.filename || filename;
          } else if (result.zip) {
            // Base64 ZIP response (backward compatibility)
            const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
            blob = new Blob([zipBlob], { type: "application/zip" });
            finalFilename = result.filename || filename;
          } else {
            throw new Error("No ZIP data available");
          }

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = finalFilename;
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
    [addDownload, updateDownload, removeDownload]
  );

  return { downloadZip };
}
