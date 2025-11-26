import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { apiFetch, apiFetchWithAuth, formatApiError } from "../../lib/api";
import { getIdToken } from "../../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { useToast } from "../../hooks/useToast";
import { GalleryProvider } from "../../context/GalleryContext";
import { useZipDownload } from "../../context/ZipDownloadContext";
import { useModal } from "../../hooks/useModal";
import { useGalleryStore } from "../../store/gallerySlice";
import { useOrderStore } from "../../store/orderSlice";
import { useUserStore } from "../../store/userSlice";
import { useZipDownload as useZipDownloadHook } from "../../hocs/withZipDownload";
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
  const { downloadZip } = useZipDownloadHook();
  
  // Zustand stores
  const { 
    currentGallery: gallery, 
    isLoading: loading, 
    error: loadError,
    setCurrentGallery,
    setLoading,
    setError,
    clearCurrentGallery 
  } = useGalleryStore();
  // Use selector to ensure re-render when order changes - watch deliveryStatus specifically
  const order = useOrderStore((state) => state.currentOrder);
  const deliveryStatus = useOrderStore((state) => state.currentOrder?.deliveryStatus);
  const setCurrentOrder = useOrderStore((state) => state.setCurrentOrder);
  const clearCurrentOrder = useOrderStore((state) => state.clearCurrentOrder);
  const { walletBalanceCents: walletBalance, refreshWalletBalance } = useUserStore();
  
  // Modal hooks
  const { isOpen: showPaymentModal, openModal: openPaymentModal, closeModal: closePaymentModal } = useModal('payment');
  const { isOpen: denyModalOpen, openModal: openDenyModal, closeModal: closeDenyModal } = useModal('deny-change');
  
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [galleryUrl, setGalleryUrl] = useState("");
  const [hasDeliveredOrders, setHasDeliveredOrders] = useState<boolean | undefined>(undefined);
  const [galleryOrders, setGalleryOrders] = useState<any[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [denyLoading, setDenyLoading] = useState(false);
  const [sendLinkLoading, setSendLinkLoading] = useState(false);
  const [orderUpdateKey, setOrderUpdateKey] = useState(0); // Force re-render when order updates
  const [paymentDetails, setPaymentDetails] = useState({
    totalAmountCents: 0,
    walletAmountCents: 0,
    stripeAmountCents: 0,
    balanceAfterPayment: 0,
  });
  
  // Define functions first (before useEffect hooks that use them)
  const loadGalleryData = useCallback(async (silent = false) => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    
    try {
      const galleryResponse = await apiFetchWithAuth(`${apiUrl}/galleries/${galleryId}`);
      
      setCurrentGallery(galleryResponse.data);
      setGalleryUrl(
        typeof window !== "undefined"
          ? `${window.location.origin}/gallery/${galleryId}`
          : ""
      );
    } catch (err) {
      if (!silent) {
        const errorMsg = formatApiError(err);
        setError(errorMsg || "Nie udało się załadować danych galerii");
        showToast("error", "Błąd", errorMsg || "Nie udało się załadować danych galerii");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [apiUrl, idToken, galleryId, setLoading, setError, setCurrentGallery, showToast]);

  const loadGalleryOrders = useCallback(async () => {
    if (!apiUrl || !galleryId) return;
    try {
      const { data } = await apiFetchWithAuth(`${apiUrl}/galleries/${galleryId}/orders`);
      const orders = data?.items || [];
      setGalleryOrders(Array.isArray(orders) ? orders : []);
    } catch (err) {
      setGalleryOrders([]);
    }
  }, [apiUrl, galleryId]);

  const checkDeliveredOrders = useCallback(async () => {
    if (!apiUrl || !galleryId) return;
    try {
      const { data } = await apiFetchWithAuth(`${apiUrl}/galleries/${galleryId}/orders/delivered`);
      const items = data?.items || data?.orders || [];
      setHasDeliveredOrders(Array.isArray(items) && items.length > 0);
    } catch (err) {
      setHasDeliveredOrders(false);
    }
  }, [apiUrl, galleryId]);

  const loadOrderData = useCallback(async () => {
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
      // Update the Zustand store - this will trigger re-render of components using useOrderStore
      setCurrentOrder(orderData);
      // Force component re-render by updating orderUpdateKey
      setOrderUpdateKey(prev => prev + 1);
      // Force a small delay to ensure state updates propagate
      await new Promise(resolve => setTimeout(resolve, 10));
    } catch (err) {
      setCurrentOrder(null);
    }
  }, [apiUrl, idToken, galleryId, orderId, setCurrentOrder]);

  // Clear state when navigating away
  useEffect(() => {
    return () => {
      if (!router.pathname.includes('/galleries/')) {
        clearCurrentGallery();
        clearCurrentOrder();
      }
    };
  }, [router.pathname, clearCurrentGallery, clearCurrentOrder]);

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
      // Refresh wallet balance only when we have a valid token
      if (idToken && idToken.trim() !== '') {
        refreshWalletBalance();
      }
      checkDeliveredOrders();
      loadGalleryOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, apiUrl, idToken, galleryId, gallery]);

  useEffect(() => {
    if (router.isReady && apiUrl && idToken && galleryId && orderId) {
      loadOrderData();
    } else {
      setCurrentOrder(null);
    }
  }, [router.isReady, apiUrl, idToken, galleryId, orderId, setCurrentOrder, loadOrderData]);

  // Listen for order updates from order page (e.g., after final upload)
  useEffect(() => {
    if (!orderId) return;

    const handleOrderUpdate = async (event) => {
      // Only reload if this is the same order
      if (event.detail?.orderId === orderId) {
        // Reload order data immediately to update sidebar
        await loadOrderData();
        // Also refresh delivered orders check in case status changed to DELIVERED
        await checkDeliveredOrders();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('orderUpdated', handleOrderUpdate);
      return () => {
        window.removeEventListener('orderUpdated', handleOrderUpdate);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Force re-render when order deliveryStatus changes - this ensures sidebar buttons update
  // MUST be before any early returns to follow Rules of Hooks
  useEffect(() => {
    // This effect will run when deliveryStatus changes, forcing a re-render
    // The orderObj, hasFinals, and canDownloadZip will be recomputed
    if (deliveryStatus) {
      setOrderUpdateKey(prev => prev + 1);
    }
  }, [deliveryStatus]);

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
    openDenyModal();
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
      closeDenyModal();
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
    
    await downloadZip({
      apiUrl,
      galleryId: galleryId as string,
      orderId: orderId as string,
    });
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
        balanceAfterPayment: (walletBalance || 0) - data.walletAmountCents,
      });
      openPaymentModal();
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg || "Nie udało się przygotować płatności");
    } finally {
      setPaymentLoading(false);
    }
  };

  const confirmPayment = async () => {
    if (!apiUrl || !idToken || !galleryId || !paymentDetails) return;

    closePaymentModal();
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
        await refreshWalletBalance();
        
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
    
    await downloadZip({
      apiUrl,
      galleryId: galleryId as string,
      orderId: orderId as string,
      endpoint: `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/zip`,
      filename: `order-${orderId}-finals.zip`,
    });
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

  // Only calculate isPaid when gallery is fully loaded to prevent flash of unpaid state
  const isPaid = gallery && gallery.galleryId ? (gallery.isPaid !== false && (gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE")) : false;

  // Calculate canDownloadZip for order
  // Only show ZIP download if selection is enabled (ZIP contains selected photos)
  // If backup addon exists, ZIP is always available regardless of order status
  // Parse order if needed - order comes from Zustand store and should be an object
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
  //    Note: After finals are uploaded (PREPARING_DELIVERY, DELIVERED), originals are deleted
  //    unless backup addon is purchased
  const hasBackupAddon = gallery?.hasBackupStorage === true;
  const canDownloadZip = orderObj && selectionEnabled ? (
    hasBackupAddon || // Always available with backup addon
    (orderObj.deliveryStatus === "CLIENT_APPROVED" ||
     orderObj.deliveryStatus === "AWAITING_FINAL_PHOTOS")
    // Exclude PREPARING_DELIVERY, PREPARING_FOR_DELIVERY, DELIVERED when no backup addon
    // because originals are deleted after finals upload
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
        onReloadGallery={async () => {
          await loadGalleryData(true);
          await loadGalleryOrders();
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
        onClose={closeDenyModal}
        onConfirm={handleDenyConfirm}
        loading={denyLoading}
      />

      {showPaymentModal && (
        <PaymentConfirmationModal
          isOpen={showPaymentModal}
          onClose={closePaymentModal}
          onConfirm={confirmPayment}
          totalAmountCents={paymentDetails.totalAmountCents}
          walletBalanceCents={walletBalance || 0}
          walletAmountCents={paymentDetails.walletAmountCents}
          stripeAmountCents={paymentDetails.stripeAmountCents}
          loading={paymentLoading}
        />
      )}
    </GalleryProvider>
  );
}

