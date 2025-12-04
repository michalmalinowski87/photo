import React, { ComponentType, useCallback } from "react";

import { formatApiError } from "../lib/api-service";
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
            // Get valid token (will refresh if needed) - using getValidToken for special 202 handling
            const { getValidToken } = await import("../lib/api-service");
            const idToken = await getValidToken();

            const response = await fetch(endpoint, {
              headers: { Authorization: `Bearer ${idToken}` },
            });

            // Handle 202 - ZIP is being generated
            if (response.status === 202) {
              updateDownload(downloadId, { status: "generating" });
              // Retry after delay
              setTimeout(() => {
                pollForZip();
              }, 2000); // Poll every 2 seconds
              return;
            }

            // Handle 200 - ZIP is ready
            if (response.ok && response.headers.get("content-type")?.includes("application/zip")) {
              updateDownload(downloadId, { status: "downloading" });
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;

              // Try to get filename from Content-Disposition header or use provided/default
              const contentDisposition = response.headers.get("content-disposition");
              let finalFilename = filename;
              if (contentDisposition) {
                const filenameMatch = contentDisposition.match(
                  /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
                );
                if (filenameMatch && filenameMatch[1]) {
                  finalFilename = filenameMatch[1].replace(/['"]/g, "");
                }
              }

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
            } else if (response.ok) {
              // JSON response (error or other status) - handle base64 ZIP for backward compatibility
              const data = await response.json();
              if (data.zip) {
                // Backward compatibility: handle base64 ZIP response
                updateDownload(downloadId, { status: "downloading" });
                const zipBlob = Uint8Array.from(atob(data.zip), (c) => c.charCodeAt(0));
                const blob = new Blob([zipBlob], { type: "application/zip" });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = data.filename || filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                updateDownload(downloadId, { status: "success" });
                setTimeout(() => {
                  removeDownload(downloadId);
                }, 3000);
              } else {
                const errorMsg = data.error || "Nie udało się pobrać pliku ZIP";
                updateDownload(downloadId, { status: "error", error: errorMsg });
              }
            } else {
              // Error response
              const errorData = await response.json().catch(() => ({
                error: "Nie udało się pobrać pliku ZIP",
              }));
              updateDownload(downloadId, {
                status: "error",
                error: errorData.error || "Nie udało się pobrać pliku ZIP",
              });
            }
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
          // Get valid token (will refresh if needed)
          const { getValidToken } = await import("../lib/api-service");
          const idToken = await getValidToken();

          const response = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${idToken}` },
          });

          // Handle 202 - ZIP is being generated
          if (response.status === 202) {
            updateDownload(downloadId, { status: "generating" });
            setTimeout(() => {
              pollForZip();
            }, 2000);
            return;
          }

          // Handle 200 - ZIP is ready
          if (response.ok && response.headers.get("content-type")?.includes("application/zip")) {
            updateDownload(downloadId, { status: "downloading" });
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;

            const contentDisposition = response.headers.get("content-disposition");
            let finalFilename = filename;
            if (contentDisposition) {
              const filenameMatch = contentDisposition.match(
                /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
              );
              if (filenameMatch && filenameMatch[1]) {
                finalFilename = filenameMatch[1].replace(/['"]/g, "");
              }
            }

            a.download = finalFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            updateDownload(downloadId, { status: "success" });
            setTimeout(() => {
              removeDownload(downloadId);
            }, 3000);
          } else if (response.ok) {
            const data = await response.json();
            if (data.zip) {
              updateDownload(downloadId, { status: "downloading" });
              const zipBlob = Uint8Array.from(atob(data.zip), (c) => c.charCodeAt(0));
              const blob = new Blob([zipBlob], { type: "application/zip" });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = data.filename || filename;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);

              updateDownload(downloadId, { status: "success" });
              setTimeout(() => {
                removeDownload(downloadId);
              }, 3000);
            } else {
              const errorMsg = data.error || "Nie udało się pobrać pliku ZIP";
              updateDownload(downloadId, { status: "error", error: errorMsg });
            }
          } else {
            const errorData = await response.json().catch(() => ({
              error: "Nie udało się pobrać pliku ZIP",
            }));
            updateDownload(downloadId, {
              status: "error",
              error: errorData.error || "Nie udało się pobrać pliku ZIP",
            });
          }
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
