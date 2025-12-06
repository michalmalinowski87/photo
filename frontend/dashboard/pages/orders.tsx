import React, { useState } from "react";

import {
  useApproveChangeRequest,
  useDenyChangeRequest,
  useDownloadZip,
  useMarkOrderCanceled,
  useMarkOrderPaid,
  useMarkOrderPartiallyPaid,
  useMarkOrderRefunded,
  useSendFinalLink,
  useUploadFinalPhotos,
} from "../hooks/mutations/useOrderMutations";
import { useGallery } from "../hooks/queries/useGalleries";
import { useOrders } from "../hooks/queries/useOrders";
import { formatApiError } from "../lib/api-service";
import { signOut, getHostedUILogoutUrl } from "../lib/auth";
import { formatPrice } from "../lib/format-price";

export default function Orders() {
  const [apiUrl, setApiUrl] = useState<string>("");
  const [galleryId, setGalleryId] = useState<string>("");
  const [idToken, setIdToken] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [finalFiles, setFinalFiles] = useState<Record<string, File[]>>({});

  // Mutations
  const approveChangeRequestMutation = useApproveChangeRequest();
  const denyChangeRequestMutation = useDenyChangeRequest();
  const downloadZipMutation = useDownloadZip();
  const uploadFinalPhotosMutation = useUploadFinalPhotos();
  const markOrderPaidMutation = useMarkOrderPaid();
  const markOrderPartiallyPaidMutation = useMarkOrderPartiallyPaid();
  const markOrderCanceledMutation = useMarkOrderCanceled();
  const markOrderRefundedMutation = useMarkOrderRefunded();
  const sendFinalLinkMutation = useSendFinalLink();

  // Track which order is being processed for per-order loading states
  const [downloadingZipOrderId, setDownloadingZipOrderId] = useState<string | null>(null);
  const [uploadingFinalOrderId, setUploadingFinalOrderId] = useState<string | null>(null);

  // React Query hooks - only fetch when galleryId is provided
  const { data: ordersData, refetch: refetchOrders } = useOrders(galleryId, {
    enabled: !!galleryId,
  });

  const { data: gallery } = useGallery(galleryId || undefined, {
    enabled: !!galleryId,
  });

  const orders = ordersData ?? [];

  async function approveChange(orderId: string): Promise<void> {
    setMessage("");
    if (!orderId || !galleryId) {
      setMessage("Order ID and Gallery ID required");
      return;
    }
    try {
      await approveChangeRequestMutation.mutateAsync({ galleryId, orderId });
      setMessage("Change request approved - selection unlocked");
      await refetchOrders();
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
      await denyChangeRequestMutation.mutateAsync({ galleryId, orderId });
      setMessage("Change request denied - order reverted to previous status");
      await refetchOrders();
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  async function downloadZip(orderId: string): Promise<void> {
    setMessage("");
    if (!galleryId) {
      setMessage("Gallery ID required");
      return;
    }
    setDownloadingZipOrderId(orderId);
    try {
      await downloadZipMutation.mutateAsync({ galleryId, orderId });
      setMessage(`Download started for order ${orderId}`);
      await refetchOrders();
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setDownloadingZipOrderId(null);
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
      await markOrderPaidMutation.mutateAsync({ galleryId, orderId });
      setMessage("Order marked as paid");
      await refetchOrders();
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
      await markOrderCanceledMutation.mutateAsync({ galleryId, orderId });
      setMessage("Zlecenie oznaczone jako anulowane");
      await refetchOrders();
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
      await markOrderRefundedMutation.mutateAsync({ galleryId, orderId });
      setMessage("Zlecenie oznaczone jako zwrócone");
      await refetchOrders();
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
      await markOrderPartiallyPaidMutation.mutateAsync({ galleryId, orderId });
      setMessage("Zlecenie oznaczone jako częściowo opłacone");
      await refetchOrders();
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
      await sendFinalLinkMutation.mutateAsync({ galleryId, orderId });
      setMessage("Final link sent to client");
      await refetchOrders();
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  async function uploadFinalPhotos(orderId: string): Promise<void> {
    if (!finalFiles[orderId] || finalFiles[orderId].length === 0) {
      setMessage("Please select files to upload");
      return;
    }

    if (!galleryId) {
      setMessage("Gallery ID required");
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

    setUploadingFinalOrderId(orderId);
    setMessage("");
    try {
      const files = finalFiles[orderId];
      await uploadFinalPhotosMutation.mutateAsync({
        galleryId,
        orderId,
        files,
      });
      setMessage(`Uploaded ${files.length} file(s) successfully`);
      setFinalFiles({ ...finalFiles, [orderId]: [] });
      await refetchOrders();
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setUploadingFinalOrderId(null);
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
        <button onClick={() => refetchOrders()} disabled={!apiUrl || !galleryId || !idToken}>
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
                        disabled={
                          downloadingZipOrderId === o.orderId || downloadZipMutation.isPending
                        }
                        className="mr-2 px-2 py-1 text-xs bg-success-500 dark:bg-success-500 text-white border-none rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Download ZIP file (one-time use)"
                      >
                        {downloadingZipOrderId === o.orderId ? "Downloading..." : "Download ZIP"}
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
                            uploadingFinalOrderId === o.orderId ||
                            uploadFinalPhotosMutation.isPending
                          }
                          className={`px-2 py-1 text-xs text-white border-none rounded ${uploadingFinalOrderId === o.orderId ? "bg-gray-300 dark:bg-gray-600 cursor-not-allowed" : "bg-gray-500 dark:bg-gray-500 cursor-pointer"}`}
                          title="Upload processed photos (stored in original, unprocessed format)"
                        >
                          {uploadingFinalOrderId === o.orderId
                            ? "Uploading..."
                            : "Upload Final Photos"}
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
