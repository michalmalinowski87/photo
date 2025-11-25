import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { apiFetch, formatApiError } from "../../lib/api";
import { getIdToken } from "../../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { useToast } from "../../hooks/useToast";
import { GalleryProvider } from "../../context/GalleryContext";
import { useZipDownload } from "../../context/ZipDownloadContext";
import GalleryLayout from "./GalleryLayout";
import PaymentConfirmationModal from "../galleries/PaymentConfirmationModal";
import { DenyChangeRequestModal } from "../orders/DenyChangeRequestModal";
import { FullPageLoading } from "../ui/loading/Loading";

interface GalleryLayoutWrapperProps {
  children: React.ReactNode;
}

export default function GalleryLayoutWrapper({ children }: GalleryLayoutWrapperProps) {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const { showToast } = useToast();
  const { startZipDownload, updateZipDownload, removeZipDownload } = useZipDownload();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [galleryUrl, setGalleryUrl] = useState("");
  const [order, setOrder] = useState(null);
  const [hasDeliveredOrders, setHasDeliveredOrders] = useState<boolean | undefined>(undefined);
  const [galleryOrders, setGalleryOrders] = useState<any[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyLoading, setDenyLoading] = useState(false);
  const [sendLinkLoading, setSendLinkLoading] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState({
    totalAmountCents: 0,
    walletAmountCents: 0,
    stripeAmountCents: 0,
    balanceAfterPayment: 0,
  });

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    if (router.isReady && galleryId) {
      initializeAuth(
        (token) => {
          setIdToken(token);
        },
        () => {
          redirectToLandingSignIn(router.asPath);
        }
      );
    }
  }, [router.isReady, galleryId, router.asPath]);

  useEffect(() => {
    if (router.isReady && apiUrl && idToken && galleryId) {
      // Only reload if galleryId changed or we don't have gallery data yet
      if (!gallery || gallery.galleryId !== galleryId) {
        loadGalleryData();
      }
      loadWalletBalance();
      checkDeliveredOrders();
      loadGalleryOrders();
    }
  }, [router.isReady, apiUrl, idToken, galleryId]);

  const loadGalleryOrders = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    try {
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const orders = data?.items || [];
      setGalleryOrders(Array.isArray(orders) ? orders : []);
    } catch (err) {
      console.error("Failed to load gallery orders:", err);
      setGalleryOrders([]);
    }
  };

  useEffect(() => {
    if (router.isReady && apiUrl && idToken && galleryId && orderId) {
      loadOrderData();
    } else {
      setOrder(null);
    }
  }, [router.isReady, apiUrl, idToken, galleryId, orderId]);

  // Listen for order updates from order page (e.g., after final upload)
  useEffect(() => {
    if (!orderId) return;

    const handleOrderUpdate = (event) => {
      // Only reload if this is the same order
      if (event.detail?.orderId === orderId) {
        loadOrderData();
        // Also refresh delivered orders check in case status changed to DELIVERED
        checkDeliveredOrders();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('orderUpdated', handleOrderUpdate);
      return () => {
        window.removeEventListener('orderUpdated', handleOrderUpdate);
      };
    }
  }, [orderId, apiUrl, idToken, galleryId]);

  const loadGalleryData = async (silent = false) => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    
    try {
      const galleryResponse = await apiFetch(`${apiUrl}/galleries/${galleryId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      setGallery(galleryResponse.data);
      setGalleryUrl(
        typeof window !== "undefined"
          ? `${window.location.origin}/gallery/${galleryId}`
          : ""
      );
    } catch (err) {
      if (!silent) {
        const errorMsg = formatApiError(err);
        setLoadError(errorMsg || "Nie udało się załadować danych galerii");
        showToast("error", "Błąd", errorMsg || "Nie udało się załadować danych galerii");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadWalletBalance = async () => {
    if (!apiUrl || !idToken) return;
    try {
      const { data } = await apiFetch(`${apiUrl}/wallet/balance`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setWalletBalance(data.balanceCents || 0);
    } catch (err) {
      console.error("Failed to load wallet balance:", err);
    }
  };

  const checkDeliveredOrders = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    try {
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/delivered`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const items = data?.items || data?.orders || [];
      setHasDeliveredOrders(Array.isArray(items) && items.length > 0);
    } catch (err) {
      console.error("Failed to check delivered orders:", err);
      setHasDeliveredOrders(false);
    }
  };

  const loadOrderData = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    try {
      const orderResponse = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      let orderData = orderResponse.data;
      if (typeof orderData === 'string') {
        try {
          orderData = JSON.parse(orderData);
        } catch {
          orderData = null;
        }
      }
      setOrder(orderData);
      // Debug logging
      console.log('GalleryLayoutWrapper: Order loaded', {
        orderId,
        hasOrder: !!orderData,
        deliveryStatus: orderData?.deliveryStatus,
        paymentStatus: orderData?.paymentStatus
      });
    } catch (err) {
      console.error('GalleryLayoutWrapper: Failed to load order', err);
      setOrder(null);
    }
  };

  const handleApproveChangeRequest = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    try {
      const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/approve-change`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      
      showToast("success", "Sukces", "Prośba o zmiany została zatwierdzona. Klient może teraz modyfikować wybór.");
      await loadOrderData();
      await loadGalleryOrders();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) || "Nie udało się zatwierdzić prośby o zmiany");
    }
  };

  const handleDenyChangeRequest = () => {
    setDenyModalOpen(true);
  };

  const handleDenyConfirm = async (reason?: string) => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    setDenyLoading(true);
    
    try {
      const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/deny-change`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: reason || undefined })
      });
      
      showToast("success", "Sukces", "Prośba o zmiany została odrzucona. Zlecenie zostało przywrócone do poprzedniego statusu.");
      setDenyModalOpen(false);
      await loadOrderData();
      await loadGalleryOrders();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) || "Nie udało się odrzucić prośby o zmiany");
    } finally {
      setDenyLoading(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId || !order) return;
    
    const orderObj = typeof order === 'string' ? (() => {
      try {
        return JSON.parse(order);
      } catch {
        return {};
      }
    })() : order;
    
    // Start download progress indicator
    const downloadId = startZipDownload(orderId as string, galleryId as string);
    
    const pollForZip = async (): Promise<void> => {
      try {
        const zipUrl = `${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`;
        const response = await fetch(zipUrl, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        
        // Handle 202 - ZIP is being generated
        if (response.status === 202) {
          updateZipDownload(downloadId, { status: 'generating' });
          // Retry after delay
          setTimeout(() => {
            pollForZip();
          }, 2000); // Poll every 2 seconds
          return;
        }
        
        // Handle 200 - ZIP is ready
        if (response.ok && response.headers.get('content-type')?.includes('application/zip')) {
          updateZipDownload(downloadId, { status: 'downloading' });
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${orderId}.zip`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          updateZipDownload(downloadId, { status: 'success' });
          // Auto-dismiss after 3 seconds
          setTimeout(() => {
            removeZipDownload(downloadId);
          }, 3000);
        } else if (response.ok) {
          // JSON response (error or other status)
          const data = await response.json();
          const errorMsg = data.error || "Nie udało się pobrać pliku ZIP";
          updateZipDownload(downloadId, { status: 'error', error: errorMsg });
        } else {
          // Error response
          const errorData = await response.json().catch(() => ({ error: 'Nie udało się pobrać pliku ZIP' }));
          updateZipDownload(downloadId, { status: 'error', error: errorData.error || "Nie udało się pobrać pliku ZIP" });
        }
      } catch (err) {
        const errorMsg = formatApiError(err);
        updateZipDownload(downloadId, { status: 'error', error: errorMsg });
      }
    };
    
    // Start polling
    pollForZip();
  };

  const handlePayClick = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    setPaymentLoading(true);

    try {
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ dryRun: true }),
      });

      setPaymentDetails({
        totalAmountCents: data.totalAmountCents,
        walletAmountCents: data.walletAmountCents,
        stripeAmountCents: data.stripeAmountCents,
        balanceAfterPayment: walletBalance - data.walletAmountCents,
      });
      setShowPaymentModal(true);
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg || "Nie udało się przygotować płatności");
    } finally {
      setPaymentLoading(false);
    }
  };

  const confirmPayment = async () => {
    if (!apiUrl || !idToken || !galleryId || !paymentDetails) return;

    setShowPaymentModal(false);
    setPaymentLoading(true);

    try {
      // If wallet balance is insufficient (split payment), force full Stripe payment
      const forceStripeOnly = paymentDetails.walletAmountCents > 0 && paymentDetails.stripeAmountCents > 0;
      
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}` 
        },
        body: JSON.stringify({ forceStripeOnly }),
      });
      
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.paid) {
        showToast("success", "Sukces", "Galeria została opłacona z portfela!");
        await loadGalleryData();
        await loadWalletBalance();
        
        // If we're on an order page, reload order data and notify the order page
        if (orderId) {
          await loadOrderData();
          // Dispatch event to notify order page to refresh
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } }));
            // Also dispatch a gallery payment event to ensure order page refreshes
            window.dispatchEvent(new CustomEvent('galleryPaymentCompleted', { detail: { galleryId } }));
          }
        }
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg || "Nie udało się opłacić galerii");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (typeof window !== "undefined" && galleryUrl) {
      navigator.clipboard.writeText(galleryUrl);
    }
  };

  const handleSendLink = async () => {
    if (!apiUrl || !idToken || !galleryId || sendLinkLoading) return;
    
    // Check if this is a reminder (has existing orders) or initial invitation
    const isReminder = galleryOrders && galleryOrders.length > 0;
    
    setSendLinkLoading(true);
    
    try {
      const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/send-to-client`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      const responseData = response.data || {};
      const isReminderResponse = responseData.isReminder || isReminder;
      
      showToast(
        "success", 
        "Sukces", 
        isReminderResponse 
          ? "Przypomnienie z linkiem do galerii zostało wysłane do klienta"
          : "Link do galerii został wysłany do klienta"
      );
      
      // Only reload if it's an initial invitation (creates order), not for reminders
      if (!isReminderResponse) {
        // Reload gallery data and orders to get the newly created CLIENT_SELECTING order
        await loadGalleryData();
        await loadGalleryOrders();
        
        // Trigger event to reload orders if we're on the gallery detail page
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('galleryOrdersUpdated', { detail: { galleryId } }));
        }
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setSendLinkLoading(false);
    }
  };

  const handleSettings = () => {
    router.push(`/galleries/${galleryId}/settings`);
  };

  // Order-specific handlers
  const handleMarkOrderPaid = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    try {
      await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/mark-paid`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      showToast("success", "Sukces", "Zlecenie zostało oznaczone jako opłacone");
      // Reload order data in wrapper to update sidebar
      await loadOrderData();
      // Trigger a custom event to notify order page to reload
      // The order page will listen to this event and reload its own order data
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } }));
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  };

  const handleDownloadFinals = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    // Start download progress indicator
    const downloadId = startZipDownload(`${orderId}-finals`, galleryId as string);
    
    const pollForFinalsZip = async (): Promise<void> => {
      try {
        const zipUrl = `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/zip`;
        const response = await fetch(zipUrl, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        
        // Handle 202 - ZIP is being generated
        if (response.status === 202) {
          updateZipDownload(downloadId, { status: 'generating' });
          // Retry after delay
          setTimeout(() => {
            pollForFinalsZip();
          }, 2000); // Poll every 2 seconds
          return;
        }
        
        // Handle 200 - ZIP is ready
        if (response.ok && response.headers.get('content-type')?.includes('application/zip')) {
          updateZipDownload(downloadId, { status: 'downloading' });
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          // Try to get filename from Content-Disposition header or use default
          const contentDisposition = response.headers.get('content-disposition');
          let filename = `order-${orderId}-finals.zip`;
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
              filename = filenameMatch[1].replace(/['"]/g, '');
            }
          }
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          updateZipDownload(downloadId, { status: 'success' });
          // Auto-dismiss after 3 seconds
          setTimeout(() => {
            removeZipDownload(downloadId);
          }, 3000);
        } else if (response.ok) {
          // JSON response (error or other status) - handle base64 ZIP for backward compatibility
          const data = await response.json();
          if (data.zip) {
            // Backward compatibility: handle base64 ZIP response
            updateZipDownload(downloadId, { status: 'downloading' });
            const zipBlob = Uint8Array.from(atob(data.zip), c => c.charCodeAt(0));
            const blob = new Blob([zipBlob], { type: 'application/zip' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = data.filename || `order-${orderId}-finals.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            updateZipDownload(downloadId, { status: 'success' });
            setTimeout(() => {
              removeZipDownload(downloadId);
            }, 3000);
          } else {
            const errorMsg = data.error || "Nie udało się pobrać pliku ZIP";
            updateZipDownload(downloadId, { status: 'error', error: errorMsg });
          }
        } else {
          // Error response
          const errorData = await response.json().catch(() => ({ error: 'Nie udało się pobrać pliku ZIP' }));
          updateZipDownload(downloadId, { status: 'error', error: errorData.error || "Nie udało się pobrać pliku ZIP" });
        }
      } catch (err) {
        const errorMsg = formatApiError(err);
        updateZipDownload(downloadId, { status: 'error', error: errorMsg });
      }
    };
    
    // Start polling
    pollForFinalsZip();
  };

  const handleSendFinalsToClient = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    try {
      await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/send-final-link`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      showToast("success", "Sukces", "Link do zdjęć finalnych został wysłany do klienta");
      // Reload order data in wrapper to update sidebar
      await loadOrderData();
      // Trigger a custom event to notify order page to reload
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } }));
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  };

  // Show loading only if we don't have gallery data yet
  if (loading && !gallery) {
    return (
      <GalleryLayout
        gallery={null}
        isPaid={false}
        galleryUrl=""
        onPay={() => {}}
        onCopyUrl={() => {}}
        onSendLink={() => {}}
        onSettings={() => {}}
        onReloadGallery={loadGalleryData}
        hasDeliveredOrders={undefined}
      >
        <FullPageLoading text="Ładowanie galerii..." />
      </GalleryLayout>
    );
  }

  // Only show error if we've tried to load and failed (not during initial load)
  if (!gallery && loadError && !loading) {
    return (
      <GalleryLayout
        gallery={null}
        isPaid={false}
        galleryUrl=""
        onPay={() => {}}
        onCopyUrl={() => {}}
        onSendLink={() => {}}
        onSettings={() => {}}
        onReloadGallery={loadGalleryData}
        hasDeliveredOrders={undefined}
      >
        <div className="p-6">
          <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600">
            {loadError}
          </div>
        </div>
      </GalleryLayout>
    );
  }

  const isPaid = gallery ? (gallery.isPaid !== false && (gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE")) : false;

  // Calculate canDownloadZip for order
  // Only show ZIP download if selection is enabled (ZIP contains selected photos)
  // If backup addon exists, ZIP is always available regardless of order status
  const orderObj = order && typeof order === 'object' ? order : (order && typeof order === 'string' ? (() => {
    try {
      return JSON.parse(order);
    } catch {
      return null;
    }
  })() : null);
  
  const selectionEnabled = gallery?.selectionEnabled !== false; // Default to true if not specified
  
  // Check if finals are uploaded - finals exist if deliveryStatus indicates they've been uploaded
  // Backend uses PREPARING_DELIVERY (without "FOR")
  // Status is updated automatically by backend when first final is uploaded or last final is deleted
  const hasFinals = orderObj && (
    orderObj.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
    orderObj.deliveryStatus === "PREPARING_DELIVERY" ||
    orderObj.deliveryStatus === "DELIVERED"
  );
  
  // ZIP download is available if:
  // 1. Backup addon exists (always available regardless of status)
  // 2. Order is in CLIENT_APPROVED or AWAITING_FINAL_PHOTOS status (before finals upload)
  const hasBackupAddon = gallery?.hasBackupStorage === true;
  const canDownloadZip = orderObj && selectionEnabled ? (
    hasBackupAddon || // Always available with backup addon
    orderObj.deliveryStatus === "CLIENT_APPROVED" ||
    orderObj.deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
    orderObj.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
    orderObj.deliveryStatus === "PREPARING_DELIVERY" ||
    orderObj.deliveryStatus === "DELIVERED"
  ) : false;

  return (
      <GalleryProvider
        gallery={gallery}
        loading={loading}
        error={loadError}
        galleryId={galleryId as string}
        reloadGallery={() => loadGalleryData(true)}
        reloadOrder={orderId ? () => loadOrderData() : undefined}
      >
      <GalleryLayout
        gallery={{ ...gallery, orders: galleryOrders }}
        isPaid={isPaid}
        galleryUrl={galleryUrl}
        onPay={handlePayClick}
        onCopyUrl={handleCopyUrl}
        onSendLink={handleSendLink}
        sendLinkLoading={sendLinkLoading}
        onSettings={handleSettings}
        onReloadGallery={() => {
          loadGalleryData(true);
          loadGalleryOrders();
        }}
        order={orderObj}
        orderId={orderId as string}
        onDownloadZip={orderId ? handleDownloadZip : undefined}
        canDownloadZip={canDownloadZip}
        onMarkOrderPaid={orderId ? handleMarkOrderPaid : undefined}
        onDownloadFinals={orderId ? handleDownloadFinals : undefined}
        onSendFinalsToClient={orderId ? handleSendFinalsToClient : undefined}
        onApproveChangeRequest={orderId ? handleApproveChangeRequest : undefined}
        onDenyChangeRequest={orderId ? handleDenyChangeRequest : undefined}
        hasFinals={hasFinals}
        hasDeliveredOrders={hasDeliveredOrders}
        galleryLoading={loading}
      >
        {children}
      </GalleryLayout>

      <DenyChangeRequestModal
        isOpen={denyModalOpen}
        onClose={() => setDenyModalOpen(false)}
        onConfirm={handleDenyConfirm}
        loading={denyLoading}
      />

      {showPaymentModal && (
        <PaymentConfirmationModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={confirmPayment}
          totalAmountCents={paymentDetails.totalAmountCents}
          walletBalanceCents={walletBalance}
          walletAmountCents={paymentDetails.walletAmountCents}
          stripeAmountCents={paymentDetails.stripeAmountCents}
          loading={paymentLoading}
        />
      )}
    </GalleryProvider>
  );
}

