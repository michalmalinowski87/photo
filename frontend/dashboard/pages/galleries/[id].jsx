import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { apiFetch, formatApiError } from "../../lib/api";
import { getIdToken } from "../../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { useGallery } from "../../context/GalleryContext";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { Modal } from "../../components/ui/modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../../components/ui/table";
import { FullPageLoading } from "../../components/ui/loading/Loading";
import { useToast } from "../../hooks/useToast";
import PaymentConfirmationModal from "../../components/galleries/PaymentConfirmationModal";
import { DenyChangeRequestModal } from "../../components/orders/DenyChangeRequestModal";

// List of filter route names that should not be treated as gallery IDs
const FILTER_ROUTES = [
  "wyslano",
  "wybrano",
  "prosba-o-zmiany",
  "gotowe-do-wysylki",
  "dostarczone",
  "robocze",
];

export default function GalleryDetail() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const { showToast } = useToast();
  const { gallery, loading: galleryLoading } = useGallery();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true); // Start with true to prevent flicker
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [showSendLinkModal, setShowSendLinkModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyLoading, setDenyLoading] = useState(false);
  const [denyOrderId, setDenyOrderId] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState({
    totalAmountCents: 0,
    walletAmountCents: 0,
    stripeAmountCents: 0,
  });
  const toast = useToast();

  // Don't render gallery detail if this is a filter route - let Next.js handle static routes
  if (router.isReady && galleryId && FILTER_ROUTES.includes(String(galleryId))) {
    return null;
  }

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    
    // Store referrer when entering gallery view (if not already stored)
    if (typeof window !== "undefined" && galleryId && router.isReady) {
      const referrerKey = `gallery_referrer_${galleryId}`;
      const referrerPath = sessionStorage.getItem(referrerKey);
      
      // Only store if we don't have a referrer yet
      if (!referrerPath) {
        // Try to get referrer from document.referrer
        let referrer = null;
        if (document.referrer) {
          try {
            const referrerUrl = new URL(document.referrer);
            const referrerPathname = referrerUrl.pathname;
            // Only use if it's from our domain and not a gallery detail page
            if (referrerUrl.origin === window.location.origin && 
                !referrerPathname.includes(`/galleries/${galleryId}`) &&
                referrerPathname !== router.asPath) {
              referrer = referrerPathname;
            }
          } catch (e) {
            // Invalid URL, ignore
          }
        }
        
        // Default to dashboard if no valid referrer found
        sessionStorage.setItem(referrerKey, referrer || "/");
      }
    }
    
    initializeAuth(
      (token) => {
        setIdToken(token);
      },
      () => {
        redirectToLandingSignIn(`/galleries/${galleryId}`);
      }
    );
  }, [galleryId, router.isReady, router.asPath]);

  useEffect(() => {
    if (apiUrl && idToken && galleryId) {
      loadOrders();
    }
  }, [apiUrl, idToken, galleryId]);

  // Listen for gallery orders update event (e.g., after sending link from sidebar)
  useEffect(() => {
    if (!apiUrl || !idToken || !galleryId) return;

    const handleGalleryOrdersUpdate = (event) => {
      // Only reload if this is the same gallery
      if (event.detail?.galleryId === galleryId) {
        loadOrders();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('galleryOrdersUpdated', handleGalleryOrdersUpdate);
      return () => {
        window.removeEventListener('galleryOrdersUpdated', handleGalleryOrdersUpdate);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, idToken, galleryId]);

  const handleApproveChangeRequest = async (orderId) => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    try {
      await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/approve-change`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      
      showToast("success", "Sukces", "Prośba o zmiany została zatwierdzona. Klient może teraz modyfikować wybór.");
      await loadOrders();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) || "Nie udało się zatwierdzić prośby o zmiany");
    }
  };

  const handleDenyChangeRequest = (orderId) => {
    setDenyOrderId(orderId);
    setDenyModalOpen(true);
  };

  const handleDenyConfirm = async (reason) => {
    if (!apiUrl || !idToken || !galleryId || !denyOrderId) return;
    
    setDenyLoading(true);
    
    try {
      await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${denyOrderId}/deny-change`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: reason || undefined })
      });
      
      showToast("success", "Sukces", "Prośba o zmiany została odrzucona. Zlecenie zostało przywrócone do poprzedniego statusu.");
      setDenyModalOpen(false);
      setDenyOrderId(null);
      await loadOrders();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) || "Nie udało się odrzucić prośby o zmiany");
    } finally {
      setDenyLoading(false);
    }
  };

  const loadOrders = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    setLoading(true);
    setError("");
    
    try {
      const ordersResponse = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      setOrders(ordersResponse.data.items || []);
    } catch (err) {
      const errorMsg = formatApiError(err);
      setError(errorMsg);
      showToast("error", "Błąd", "Nie udało się załadować zleceń");
    } finally {
      setLoading(false);
    }
  };

  const handlePayClick = async () => {
    if (!apiUrl || !idToken || !galleryId || !gallery) return;
    
    setPaymentLoading(true);
    
    try {
      // First, get payment details using dry run
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

  const handlePaymentConfirm = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    setShowPaymentModal(false);
    setPaymentLoading(true);
    
    try {
      // Call pay endpoint without dryRun to actually process payment
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.paid) {
        showToast("success", "Sukces", "Galeria została opłacona z portfela!");
        // Gallery data will be reloaded by GalleryLayoutWrapper
        await loadWalletBalance();
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg || "Nie udało się opłacić galerii");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleSendLink = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    // Check if this is a reminder (has existing orders) or initial invitation
    const isReminder = orders && orders.length > 0;
    
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
      setShowSendLinkModal(false);
      
      // Reload orders (only creates order if no orders exist)
      await loadOrders();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  };

  const handleUpdateSettings = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    try {
      // Update client password if provided (requires clientEmail)
      if (settingsForm.clientPassword && settingsForm.clientEmail) {
        await apiFetch(`${apiUrl}/galleries/${galleryId}/client-password`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            password: settingsForm.clientPassword,
            clientEmail: settingsForm.clientEmail,
          }),
        });
      }
      
      // Update pricing package if changed
      const pkgChanged =
        settingsForm.packageName !== gallery?.pricingPackage?.packageName ||
        settingsForm.includedCount !== gallery?.pricingPackage?.includedCount ||
        settingsForm.extraPriceCents !== gallery?.pricingPackage?.extraPriceCents ||
        settingsForm.packagePriceCents !== gallery?.pricingPackage?.packagePriceCents;
      
      if (pkgChanged) {
        await apiFetch(`${apiUrl}/galleries/${galleryId}/pricing-package`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            pricingPackage: {
              packageName: settingsForm.packageName,
              includedCount: settingsForm.includedCount,
              extraPriceCents: settingsForm.extraPriceCents,
              packagePriceCents: settingsForm.packagePriceCents,
            },
          }),
        });
      }
      
      showToast("success", "Sukces", "Ustawienia zostały zaktualizowane");
      setShowSettingsModal(false);
      // Gallery data will be reloaded by GalleryLayoutWrapper
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  };

  const getDeliveryStatusBadge = (status) => {
    const statusMap = {
      CLIENT_SELECTING: { color: "info", label: "Wybór przez klienta" },
      CLIENT_APPROVED: { color: "success", label: "Zatwierdzone" },
      AWAITING_FINAL_PHOTOS: { color: "warning", label: "Oczekuje na finały" },
      CHANGES_REQUESTED: { color: "warning", label: "Prośba o zmiany" },
      PREPARING_FOR_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
      PREPARING_DELIVERY: { color: "info", label: "Oczekuje do wysłania" },
      DELIVERED: { color: "success", label: "Dostarczone" },
      CANCELLED: { color: "error", label: "Anulowane" },
    };
    
    const statusInfo = statusMap[status] || { color: "light", label: status };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  const getPaymentStatusBadge = (status) => {
    const statusMap = {
      UNPAID: { color: "error", label: "Nieopłacone" },
      PARTIALLY_PAID: { color: "warning", label: "Częściowo opłacone" },
      PAID: { color: "success", label: "Opłacone" },
      REFUNDED: { color: "error", label: "Zwrócone" },
    };
    
    const statusInfo = statusMap[status] || { color: "light", label: status };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  // Gallery data comes from GalleryContext (provided by GalleryLayoutWrapper)
  // Show loading only for orders, not gallery (gallery loading is handled by wrapper)
  if (galleryLoading) {
    return <FullPageLoading text="Ładowanie zleceń..." />;
  }

  if (!gallery) {
    return null; // Error is handled by GalleryLayoutWrapper
  }

  const isPaid = gallery.isPaid !== false && (gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE");

  return (
    <>
      {/* Draft Banner */}
      {!isPaid && (
        <div className="mb-6 p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-warning-800 dark:text-warning-200 mb-1">
                Wersja robocza
              </div>
              <div className="text-xs text-warning-600 dark:text-warning-400">
                Twoja galeria jest w wersji roboczej, klienci nie mają do niej dostępu. Opłać galerię aby Twoi klienci mogli ją zobaczyć.
              </div>
            </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handlePayClick}
                  disabled={paymentLoading}
                >
                  {paymentLoading ? "Przetwarzanie..." : "Opłać galerię"}
                </Button>
          </div>
        </div>
      )}

      {/* Main Content - Orders */}
      <div>
        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Zlecenia
            </h2>
            {!loading && (
              <Badge color="info" variant="light">
                {orders.length} {orders.length === 1 ? "zlecenie" : "zleceń"}
              </Badge>
            )}
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500 dark:text-gray-400">
                Ładowanie zleceń...
              </div>
            </div>
          ) : orders.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              Brak zleceń dla tej galerii
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Numer
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Status dostawy
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Status płatności
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Kwota
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Data utworzenia
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Akcje
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow
                      key={order.orderId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        #{order.orderNumber || order.orderId.slice(-8)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        {getDeliveryStatusBadge(order.deliveryStatus)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        {getPaymentStatusBadge(order.paymentStatus)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {((order.totalCents || 0) / 100).toFixed(2)} PLN
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString("pl-PL")
                          : "-"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {order.deliveryStatus === 'CHANGES_REQUESTED' && (
                            <>
                              <Button 
                                size="sm" 
                                variant="primary"
                                onClick={() => handleApproveChangeRequest(order.orderId)}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                Zatwierdź
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleDenyChangeRequest(order.orderId)}
                              >
                                Odrzuć
                              </Button>
                            </>
                          )}
                          <Link href={`/galleries/${galleryId}/orders/${order.orderId}`}>
                            <Button size="sm" variant="outline">
                              Szczegóły
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Send Link Modal */}
      <Modal
        isOpen={showSendLinkModal}
        onClose={() => setShowSendLinkModal(false)}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Wyślij link do klienta
          </h2>
          
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Link do galerii zostanie wysłany na adres:{" "}
            <strong>{gallery.clientEmail}</strong>
          </p>
          
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowSendLinkModal(false)}>
              Anuluj
            </Button>
            <Button variant="primary" onClick={handleSendLink}>
              Wyślij
            </Button>
          </div>
        </div>
          </Modal>

          {/* Deny Change Request Modal */}
          <DenyChangeRequestModal
            isOpen={denyModalOpen}
            onClose={() => {
              setDenyModalOpen(false);
              setDenyOrderId(null);
            }}
            onConfirm={handleDenyConfirm}
            loading={denyLoading}
          />

          {/* Payment Confirmation Modal */}
          <PaymentConfirmationModal
            isOpen={showPaymentModal}
            onClose={() => {
              setShowPaymentModal(false);
              setPaymentLoading(false);
            }}
            onConfirm={handlePaymentConfirm}
            totalAmountCents={paymentDetails.totalAmountCents}
            walletBalanceCents={walletBalance}
            walletAmountCents={paymentDetails.walletAmountCents}
            stripeAmountCents={paymentDetails.stripeAmountCents}
            loading={paymentLoading}
          />
    </>
  );
}

