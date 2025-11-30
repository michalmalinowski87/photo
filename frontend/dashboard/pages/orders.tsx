import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

import api, { formatApiError } from "../lib/api-service";
import { signOut, getHostedUILogoutUrl } from "../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import { formatPrice } from "../lib/format-price";

interface Order {
  orderId: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  selectedCount?: number;
  overageCents?: number;
  [key: string]: unknown;
}

interface Gallery {
  selectionEnabled?: boolean;
  [key: string]: unknown;
}

interface OrdersResponse {
  items?: Order[];
  gallery?: Gallery;
  [key: string]: unknown;
}

interface ErrorResponse {
  error?: string;
  message?: string;
}


export default function Orders() {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState<string>("");
  const [galleryId, setGalleryId] = useState<string>("");
  const [idToken, setIdToken] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [message, setMessage] = useState<string>("");
  const [downloadingZip, setDownloadingZip] = useState<Record<string, boolean>>({});
  const [uploadingFinal, setUploadingFinal] = useState<Record<string, boolean>>({});
  const [finalFiles, setFinalFiles] = useState<Record<string, File[]>>({});

  useEffect(() => {
    // Initialize auth with token sharing
    initializeAuth(
      (_token: string) => {
        // Token is handled by api-service automatically
      },
      () => {
        // No token found, redirect to landing sign-in
        redirectToLandingSignIn(router.asPath);
      }
    );
  }, [router]);

  async function loadOrders(): Promise<void> {
    setMessage("");
    if (!galleryId) {
      setMessage("Need Gallery ID");
      return;
    }
    try {
      const response = await api.orders.getByGallery(galleryId);
      const parsedData: OrdersResponse = {
        items: Array.isArray(response.items) ? response.items : [],
      };

      // Extract items array and gallery metadata
      const ordersData = parsedData?.items;
      const galleryData = parsedData?.gallery;

      if (Array.isArray(ordersData)) {
        setOrders(ordersData);
        setGallery(galleryData ?? null);
        if (ordersData.length === 0) {
          setMessage("No orders found for this gallery");
        } else {
          setMessage(`Loaded ${ordersData.length} order(s)`);
        }
      } else {
        setMessage(`Unexpected response format. Expected items array, got: ${typeof ordersData}`);
        setOrders([]);
      }
    } catch (error) {
      setMessage(formatApiError(error));
      setOrders([]);
    }
  }

  async function approveChange(orderId: string): Promise<void> {
    setMessage("");
    if (!orderId || !galleryId) {
      setMessage("Order ID and Gallery ID required");
      return;
    }
    try {
      await api.orders.approveChangeRequest(galleryId, orderId);
      setMessage("Change request approved - selection unlocked");
      await loadOrders();
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  async function denyChange(orderId: string): Promise<void> {
    setMessage("");
    if (!orderId || !galleryId) {
      setMessage("Order ID and Gallery ID required");
      return;
    }
    try {
      await api.orders.denyChangeRequest(galleryId, orderId);
      setMessage("Change request denied - order reverted to previous status");
      await loadOrders();
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  async function downloadZip(orderId: string): Promise<void> {
    setMessage("");
    setDownloadingZip({ [orderId]: true });
    if (!galleryId) {
      setMessage("Gallery ID required");
      setDownloadingZip({});
      return;
    }
    try {
      // Use api-service for token, but fetch directly for blob handling
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
      const { getValidToken } = await import("../lib/api");
      const token: string = await getValidToken();
      const response = await fetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.headers.get("content-type")?.includes("application/zip")) {
        // Binary ZIP response - trigger download
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${orderId}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Check if it's one-time use from response headers or try to get from JSON
        const oneTimeUse = response.headers.get("x-one-time-use") === "true";
        setMessage(`Download started for order ${orderId}${oneTimeUse ? " (one-time use)" : ""}`);
        await loadOrders(); // Reload to refresh order state
      } else {
        // JSON response (fallback or error)
        const data = (await response.json()) as ErrorResponse;
        if (data.error) {
          setMessage(`Error: ${data.error}`);
        } else {
          setMessage("No ZIP file available");
        }
      }
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setDownloadingZip({});
    }
  }

  async function markAsPaid(orderId: string): Promise<void> {
    setMessage("");
    if (
      // eslint-disable-next-line no-alert
      !window.confirm(
        "Mark this order as paid? This should only be done if payment was received outside the system."
      )
    ) {
      return;
    }
    if (!galleryId) {
      setMessage("Gallery ID required");
      return;
    }
    try {
      const response = await api.orders.markPaid(galleryId, orderId);
      // Merge lightweight response into orders array instead of refetching
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === orderId
            ? { ...order, paymentStatus: response.paymentStatus, paidAt: response.paidAt }
            : order
        )
      );
      setMessage("Order marked as paid");
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  async function markAsCanceled(orderId: string): Promise<void> {
    setMessage("");
    // Note: In production, use a confirmation modal instead of window.confirm
    // eslint-disable-next-line no-alert
    if (!window.confirm("Oznaczyć to zlecenie jako anulowane? Ta akcja nie może być cofnięta.")) {
      return;
    }
    if (!galleryId) {
      setMessage("Gallery ID required");
      return;
    }
    try {
      const response = await api.orders.markCanceled(galleryId, orderId);
      // Merge lightweight response into orders array instead of refetching
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === orderId
            ? {
                ...order,
                deliveryStatus: response.deliveryStatus,
                canceledAt: response.canceledAt,
              }
            : order
        )
      );
      setMessage("Zlecenie oznaczone jako anulowane");
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  async function markAsRefunded(orderId: string): Promise<void> {
    setMessage("");
    // Note: In production, use a confirmation modal instead of window.confirm
    if (
      // eslint-disable-next-line no-alert
      !window.confirm(
        "Oznaczyć to zlecenie jako zwrócone? To powinno być wykonane tylko jeśli zwrot został przetworzony poza systemem."
      )
    ) {
      return;
    }
    if (!galleryId) {
      setMessage("Gallery ID required");
      return;
    }
    try {
      const response = await api.orders.markRefunded(galleryId, orderId);
      // Merge lightweight response into orders array instead of refetching
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === orderId
            ? {
                ...order,
                paymentStatus: response.paymentStatus,
                refundedAt: response.refundedAt,
              }
            : order
        )
      );
      setMessage("Zlecenie oznaczone jako zwrócone");
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  async function markAsPartiallyPaid(orderId: string): Promise<void> {
    setMessage("");
    // Note: In production, use a confirmation modal instead of window.confirm
    if (
      // eslint-disable-next-line no-alert
      !window.confirm(
        "Oznaczyć to zlecenie jako częściowo opłacone? To powinno być wykonane tylko jeśli wpłata została otrzymana poza systemem."
      )
    ) {
      return;
    }
    if (!galleryId) {
      setMessage("Gallery ID required");
      return;
    }
    try {
      const response = await api.orders.markPartiallyPaid(galleryId, orderId);
      // Merge lightweight response into orders array instead of refetching
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === orderId
            ? {
                ...order,
                paymentStatus: response.paymentStatus,
                partiallyPaidAt: response.partiallyPaidAt,
              }
            : order
        )
      );
      setMessage("Zlecenie oznaczone jako częściowo opłacone");
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  async function sendFinalLink(orderId: string): Promise<void> {
    setMessage("");
    if (!orderId || !galleryId) {
      setMessage("Order ID and Gallery ID required");
      return;
    }
    try {
      const response = await api.orders.sendFinalLink(galleryId, orderId);
      // Merge lightweight response into orders array instead of refetching
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.orderId === orderId
            ? {
                ...order,
                deliveryStatus: response.deliveryStatus,
                deliveredAt: response.deliveredAt,
              }
            : order
        )
      );
      setMessage("Final link sent to client");
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  async function uploadFinalPhotos(orderId: string): Promise<void> {
    if (!finalFiles[orderId] || finalFiles[orderId].length === 0) {
      setMessage("Please select files to upload");
      return;
    }

    // Check if selection is enabled from gallery metadata
    const selectionEnabled = gallery?.selectionEnabled !== false;

    // Show confirmation before upload
    if (selectionEnabled) {
      // eslint-disable-next-line no-alert
      if (!window.confirm("Do you want to continue with upload?")) {
        return;
      }
    }

    setUploadingFinal({ ...uploadingFinal, [orderId]: true });
    setMessage("");
    try {
      const files = finalFiles[orderId];
      for (const file of files) {
        const fileName = file.name;
        // Get presigned URL
        const pr = await api.uploads.getFinalImagePresignedUrl(galleryId, orderId, {
          key: fileName,
          contentType: file.type ?? "application/octet-stream",
        });
        // Upload file
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
            }
          });
          xhr.addEventListener("error", () => reject(new Error("Upload failed")));
          xhr.open("PUT", pr.url);
          xhr.setRequestHeader("Content-Type", file.type ?? "application/octet-stream");
          xhr.send(file);
        });
      }
      setMessage(`Uploaded ${files.length} file(s) successfully`);
      setFinalFiles({ ...finalFiles, [orderId]: [] });
      await loadOrders();
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setUploadingFinal({ ...uploadingFinal, [orderId]: false });
    }
  }

  const handleLogout = (): void => {
    // Clear all tokens and session data on dashboard domain
    signOut();
    setIdToken("");

    // Redirect to Cognito logout endpoint to clear server-side session cookies
    // After logout, redirect to landing main page
    const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:3002";
    const logoutRedirectUrl = landingUrl; // Redirect to main landing page, not logout-callback

    if (userPoolDomain) {
      // Use helper function to build Cognito logout URL
      const logoutUrl = getHostedUILogoutUrl(userPoolDomain, logoutRedirectUrl);
      window.location.href = logoutUrl;
    } else {
      // Fallback: redirect directly to landing main page
      window.location.href = logoutRedirectUrl;
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: "100%", boxSizing: "border-box" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>Orders</h1>
        {idToken && (
          <button onClick={handleLogout} style={{ padding: "8px 16px" }}>
            Logout
          </button>
        )}
      </div>

      {/* Configuration - Only show if not auto-configured */}
      {(!process.env.NEXT_PUBLIC_API_URL || !idToken) && (
        <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <div className="mb-2">
            <label>API URL </label>
            <input
              className="w-full max-w-[420px]"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
          </div>
          <div className="mb-2">
            <label>ID Token </label>
            <input
              className="w-full max-w-[420px]"
              value={idToken}
              onChange={(e) => setIdToken(e.target.value)}
              placeholder="Auto-filled if logged in"
            />
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <label>Gallery ID </label>
          <input
            style={{ width: "100%", maxWidth: 420 }}
            value={galleryId}
            onChange={(e) => setGalleryId(e.target.value)}
          />
        </div>
        <button onClick={() => loadOrders()} disabled={!apiUrl || !galleryId || !idToken}>
          Load Orders
        </button>
      </div>
      {message ? <p>{message}</p> : null}
      <div style={{ overflowX: "auto" }}>
        <table
          border={1}
          cellPadding={6}
          style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}
        >
          <thead>
            <tr>
              <th>OrderId</th>
              <th>Delivery Status</th>
              <th>Payment Status</th>
              <th>Selected</th>
              <th>Overage</th>
              <th>ZIP</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center p-5 text-gray-500 dark:text-gray-400">
                  No orders found
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.orderId}>
                  <td>{o.orderId}</td>
                  <td>{o.deliveryStatus ?? "-"}</td>
                  <td>{o.paymentStatus ?? "-"}</td>
                  <td>{o.selectedCount}</td>
                  <td>{o.overageCents ? formatPrice(o.overageCents) : "0.00 PLN"}</td>
                  <td>-</td>
                  <td>
                    {/* Download ZIP - available for CLIENT_APPROVED orders */}
                    {o.deliveryStatus === "CLIENT_APPROVED" && (
                      <button
                        onClick={() => downloadZip(o.orderId)}
                        disabled={downloadingZip[o.orderId]}
                        className="mr-2 px-2 py-1 text-xs bg-success-500 dark:bg-success-500 text-white border-none rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Download ZIP file (one-time use)"
                      >
                        {downloadingZip[o.orderId] ? "Downloading..." : "Download ZIP"}
                      </button>
                    )}
                    {/* Mark as Paid - available for UNPAID orders */}
                    {o.paymentStatus === "UNPAID" && (
                      <button
                        onClick={() => markAsPaid(o.orderId)}
                        className="mr-2 px-2 py-1 text-xs bg-brand-500 dark:bg-brand-500 text-white border-none rounded cursor-pointer"
                      >
                        Mark as Paid
                      </button>
                    )}
                    {/* Mark as Deposit Paid - available for UNPAID orders */}
                    {o.paymentStatus === "UNPAID" && (
                      <button
                        onClick={() => markAsPartiallyPaid(o.orderId)}
                        className="mr-2 px-2 py-1 text-xs bg-gray-500 dark:bg-gray-500 text-white border-none rounded cursor-pointer"
                      >
                        Mark Deposit Paid
                      </button>
                    )}
                    {/* Mark as Canceled - available for orders that are not CANCELLED or DELIVERED */}
                    {o.deliveryStatus !== "CANCELLED" && o.deliveryStatus !== "DELIVERED" && (
                      <button
                        onClick={() => markAsCanceled(o.orderId)}
                        className="mr-2 px-2 py-1 text-xs bg-error-500 dark:bg-error-500 text-white border-none rounded cursor-pointer"
                      >
                        Mark as Canceled
                      </button>
                    )}
                    {/* Mark as Refunded - available for orders with PAID or PARTIALLY_PAID payment status */}
                    {(o.paymentStatus === "PAID" || o.paymentStatus === "PARTIALLY_PAID") &&
                      o.deliveryStatus !== "DELIVERED" && (
                        <button
                          onClick={() => markAsRefunded(o.orderId)}
                          className="mr-2 px-2 py-1 text-xs bg-warning-500 dark:bg-warning-500 text-gray-900 dark:text-white border-none rounded cursor-pointer"
                        >
                          Mark as Refunded
                        </button>
                      )}
                    {/* Approve/Deny Change Request - available for CHANGES_REQUESTED orders */}
                    {o.deliveryStatus === "CHANGES_REQUESTED" && (
                      <>
                        <button
                          onClick={() => denyChange(o.orderId)}
                          className="mr-2 px-2 py-1 text-xs bg-error-500 dark:bg-error-500 text-white border-none rounded cursor-pointer"
                          title="Deny change request and revert to previous status"
                        >
                          Deny Change Request
                        </button>
                        <button
                          onClick={() => approveChange(o.orderId)}
                          className="mr-2 px-2 py-1 text-xs bg-success-500 dark:bg-success-500 text-white border-none rounded cursor-pointer"
                          title="Approve change request and unlock selection"
                        >
                          Approve Change Request
                        </button>
                      </>
                    )}
                    {/* Upload Final Photos - available for CLIENT_APPROVED, AWAITING_FINAL_PHOTOS, or PREPARING_DELIVERY orders */}
                    {(o.deliveryStatus === "CLIENT_APPROVED" ||
                      o.deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
                      o.deliveryStatus === "PREPARING_DELIVERY") && (
                      <div className="mb-2 flex items-center gap-2 flex-wrap">
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            setFinalFiles({ ...finalFiles, [o.orderId]: files });
                          }}
                          className="text-xs"
                        />
                        <button
                          onClick={() => uploadFinalPhotos(o.orderId)}
                          disabled={
                            !finalFiles[o.orderId] ||
                            finalFiles[o.orderId].length === 0 ||
                            uploadingFinal[o.orderId]
                          }
                          className={`px-2 py-1 text-xs text-white border-none rounded ${uploadingFinal[o.orderId] ? "bg-gray-300 dark:bg-gray-600 cursor-not-allowed" : "bg-gray-500 dark:bg-gray-500 cursor-pointer"}`}
                          title="Upload processed photos (stored in original, unprocessed format)"
                        >
                          {uploadingFinal[o.orderId] ? "Uploading..." : "Upload Final Photos"}
                        </button>
                      </div>
                    )}
                    {/* Send Final Link - available for PREPARING_DELIVERY orders with PAID payment */}
                    {/* This action sends the final link email AND marks the order as DELIVERED */}
                    {/* Only available after photos are uploaded (status changed to PREPARING_DELIVERY) */}
                    {o.deliveryStatus === "PREPARING_DELIVERY" && o.paymentStatus === "PAID" && (
                      <button
                        onClick={() => sendFinalLink(o.orderId)}
                        className="mr-2 px-2 py-1 text-xs bg-success-500 dark:bg-success-500 text-white border-none rounded cursor-pointer"
                        title="Send final link to client, mark as delivered, and clean up originals/thumbs/previews"
                      >
                        Send Final Link
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
