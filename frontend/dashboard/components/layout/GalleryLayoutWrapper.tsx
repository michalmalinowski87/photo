import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { apiFetch, formatApiError } from "../../lib/api";
import { getIdToken } from "../../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { useToast } from "../../hooks/useToast";
import { GalleryProvider } from "../../context/GalleryContext";
import GalleryLayout from "./GalleryLayout";
import PaymentConfirmationModal from "../galleries/PaymentConfirmationModal";
import { FullPageLoading } from "../ui/loading/Loading";

interface GalleryLayoutWrapperProps {
  children: React.ReactNode;
}

export default function GalleryLayoutWrapper({ children }: GalleryLayoutWrapperProps) {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const { showToast } = useToast();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [galleryUrl, setGalleryUrl] = useState("");
  const [order, setOrder] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentLoading, setPaymentLoading] = useState(false);
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
    }
  }, [router.isReady, apiUrl, idToken, galleryId]);

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

  const handleDownloadZip = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId || !order) return;
    
    const orderObj = typeof order === 'string' ? (() => {
      try {
        return JSON.parse(order);
      } catch {
        return {};
      }
    })() : order;
    
    try {
      if (!orderObj.zipKey) {
        await apiFetch(
          `${apiUrl}/galleries/${galleryId}/orders/${orderId}/generate-zip`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
          }
        );
        await loadOrderData();
      }
      
      const zipUrl = `${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`;
      const response = await fetch(zipUrl, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${orderId}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        showToast("error", "Błąd", "Nie udało się pobrać pliku ZIP");
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
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
    if (!apiUrl || !idToken || !galleryId) return;

    setShowPaymentModal(false);
    setPaymentLoading(true);

    try {
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
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
    if (!apiUrl || !idToken || !galleryId) return;
    
    try {
      await apiFetch(`${apiUrl}/galleries/${galleryId}/send-to-client`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      showToast("success", "Sukces", "Link do galerii został wysłany do klienta");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
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
    try {
      const response = await fetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/zip`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.zip) {
          const zipBlob = Uint8Array.from(atob(data.zip), c => c.charCodeAt(0));
          const blob = new Blob([zipBlob], { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = data.filename || `order-${orderId}-finals.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast("success", "Sukces", "Pobieranie rozpoczęte");
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Nie udało się pobrać pliku ZIP");
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
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
  
  const canDownloadZip = orderObj && selectionEnabled ? (
    orderObj.zipKey || 
    orderObj.deliveryStatus === "CLIENT_APPROVED" ||
    orderObj.deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
    orderObj.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
    orderObj.deliveryStatus === "PREPARING_DELIVERY" ||
    orderObj.deliveryStatus === "DELIVERED"
  ) : false;

  // Debug logging
  console.log('GalleryLayoutWrapper: Order actions check', {
    orderId,
    hasOrder: !!orderObj,
    isPaid,
    hasFinals,
    deliveryStatus: orderObj?.deliveryStatus,
    galleryId,
    galleryState: gallery?.state,
    galleryIsPaid: gallery?.isPaid,
    galleryPaymentStatus: gallery?.paymentStatus
  });

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
        gallery={gallery}
        isPaid={isPaid}
        galleryUrl={galleryUrl}
        onPay={handlePayClick}
        onCopyUrl={handleCopyUrl}
        onSendLink={handleSendLink}
        onSettings={handleSettings}
        onReloadGallery={() => loadGalleryData(true)}
        order={orderObj}
        orderId={orderId as string}
        onDownloadZip={orderId ? handleDownloadZip : undefined}
        canDownloadZip={canDownloadZip}
        onMarkOrderPaid={orderId ? handleMarkOrderPaid : undefined}
        onDownloadFinals={orderId ? handleDownloadFinals : undefined}
        onSendFinalsToClient={orderId ? handleSendFinalsToClient : undefined}
        hasFinals={hasFinals}
      >
        {children}
      </GalleryLayout>

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

