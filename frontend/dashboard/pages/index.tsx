import Link from "next/link";
import { useState, useEffect } from "react";

import { DenyChangeRequestModal } from "../components/orders/DenyChangeRequestModal";
import { OrdersModal } from "../components/orders/OrdersModal";
import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import { FullPageLoading } from "../components/ui/loading/Loading";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import api, { formatApiError } from "../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import { formatCurrencyInput } from "../lib/currency";
import { formatPrice, formatPriceNumber } from "../lib/format-price";
import { StripeRedirectOverlay } from "../components/galleries/StripeRedirectOverlay";

interface Order {
  orderId?: string;
  galleryId?: string;
  galleryName?: string;
  orderNumber?: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  totalCents?: number;
  createdAt?: string | number | Date;
  [key: string]: unknown;
}

interface Gallery {
  galleryId?: string;
  pricingPackage?: {
    packagePriceCents?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type BadgeColor = "info" | "success" | "warning" | "error" | "light";

export default function Dashboard() {
  const [loading, setLoading] = useState(true); // Start with true to prevent flicker
  const [error, setError] = useState("");

  // Statistics
  const [stats, setStats] = useState({
    deliveredOrders: 0,
    clientSelectingOrders: 0,
    readyToShipOrders: 0,
    totalRevenue: 0,
  });

  // Wallet
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [customTopUpAmount, setCustomTopUpAmount] = useState("");
  const [showTopUpRedirect, setShowTopUpRedirect] = useState(false);
  const [topUpCheckoutUrl, setTopUpCheckoutUrl] = useState<string | undefined>(undefined);
  const [topUpLoading, setTopUpLoading] = useState(false);

  // Active orders
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);

  // Modal states
  const [activeOrdersModalOpen, setActiveOrdersModalOpen] = useState(false);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyLoading, setDenyLoading] = useState(false);
  const [denyGalleryId, setDenyGalleryId] = useState<string | null>(null);
  const [denyOrderId, setDenyOrderId] = useState<string | null>(null);

  const loadDashboardData = async () => {
    setLoading(true);
    setError("");

    try {
      // Load all orders for statistics (get enough to calculate stats accurately)
      const statsData = await api.orders.list({ page: 1, itemsPerPage: 1000 });

      // Load active orders (non-delivered) with pagination
      const activeOrdersData = await api.orders.list({
        excludeDeliveryStatus: "DELIVERED",
        page: 1,
        itemsPerPage: 5,
      });

      // Load galleries to get plan prices for total revenue calculation
      const galleriesData = await api.galleries.list();

      // Extract orders for statistics
      let allOrders = [];
      if (Array.isArray(statsData)) {
        allOrders = statsData;
      } else if (statsData && Array.isArray(statsData.items)) {
        allOrders = statsData.items;
      } else {
        setError("Nieprawidłowy format odpowiedzi z API");
        return;
      }

      // Extract galleries
      let allGalleries: Gallery[] = [];
      if (Array.isArray(galleriesData)) {
        allGalleries = galleriesData as Gallery[];
      } else if (
        galleriesData &&
        typeof galleriesData === "object" &&
        "items" in galleriesData &&
        Array.isArray(galleriesData.items)
      ) {
        allGalleries = galleriesData.items as Gallery[];
      }

      // Aggregate statistics from all orders
      let deliveredCount = 0;
      let clientSelectingCount = 0;
      let readyToShipCount = 0;
      let totalRevenueCents = 0;

      // Sum revenue from orders (additional photos)
      for (const order of allOrders) {
        if (order && typeof order === "object") {
          const orderObj = order as Order;
          if (orderObj.deliveryStatus === "DELIVERED") {
            deliveredCount++;
          } else if (orderObj.deliveryStatus === "CLIENT_SELECTING") {
            clientSelectingCount++;
          } else if (orderObj.deliveryStatus === "PREPARING_FOR_DELIVERY") {
            readyToShipCount++;
          }

          totalRevenueCents += typeof orderObj.totalCents === "number" ? orderObj.totalCents : 0;
        }
      }

      // Add photography package prices to total revenue
      for (const gallery of allGalleries) {
        if (
          gallery &&
          typeof gallery === "object" &&
          gallery.pricingPackage &&
          typeof gallery.pricingPackage === "object"
        ) {
          const packagePriceCents = gallery.pricingPackage.packagePriceCents;
          totalRevenueCents += typeof packagePriceCents === "number" ? packagePriceCents : 0;
        }
      }

      // Extract active orders from paginated response
      let activeOrders: Order[] = [];
      if (Array.isArray(activeOrdersData)) {
        activeOrders = activeOrdersData as Order[];
      } else if (
        activeOrdersData &&
        typeof activeOrdersData === "object" &&
        "items" in activeOrdersData &&
        Array.isArray(activeOrdersData.items)
      ) {
        activeOrders = activeOrdersData.items as Order[];
      }

      setStats({
        deliveredOrders: deliveredCount,
        clientSelectingOrders: clientSelectingCount,
        readyToShipOrders: readyToShipCount,
        totalRevenue: totalRevenueCents,
      });

      setActiveOrders(activeOrders);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadWalletBalance = async () => {
    try {
      const data = await api.wallet.getBalance();
      setWalletBalance(data.balanceCents || 0);
    } catch (_err) {
      // Ignore wallet errors
    }
  };

  useEffect(() => {
    initializeAuth(
      () => {
        void loadDashboardData();
        void loadWalletBalance();
      },
      () => {
        redirectToLandingSignIn("/");
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle payment success redirect
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "success") {
        void loadWalletBalance();
        // Clear the payment success parameter from URL
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApproveChangeRequest = async (galleryId: string, orderId: string) => {
    if (!galleryId || !orderId) {
      return;
    }

    try {
      await api.orders.approveChangeRequest(galleryId, orderId);

      // Reload dashboard data to refresh the orders list
      await loadDashboardData();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleDenyChangeRequest = (galleryId: string, orderId: string) => {
    setDenyGalleryId(galleryId);
    setDenyOrderId(orderId);
    setDenyModalOpen(true);
  };

  const handleDenyConfirm = async (reason?: string) => {
    if (!denyGalleryId || !denyOrderId) {
      return;
    }

    setDenyLoading(true);

    try {
      await api.orders.denyChangeRequest(denyGalleryId, denyOrderId, reason);

      // Reload dashboard data to refresh the orders list
      setDenyModalOpen(false);
      setDenyGalleryId(null);
      setDenyOrderId(null);
      await loadDashboardData();
    } catch (error) {
      setError(formatApiError(error));
    } finally {
      setDenyLoading(false);
    }
  };

  const handleTopUp = async (amountCents: number) => {
    if (amountCents < 2000) {
      setError("Minimalna kwota doładowania to 20 PLN");
      return;
    }

    // Show redirect overlay IMMEDIATELY when button is clicked
    setShowTopUpRedirect(true);
    setTopUpLoading(true);
    setError("");

    try {
      const redirectUrl =
        typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?payment=success` : "";

      const data = await api.payments.createCheckout({
        amountCents,
        type: "wallet_topup",
        redirectUrl,
      });

      if (data.checkoutUrl) {
        // Update checkout URL once we receive it
        setTopUpCheckoutUrl(data.checkoutUrl);
      } else {
        const errorMsg = "Nie otrzymano URL do płatności";
        setError(errorMsg);
        setShowTopUpRedirect(false);
        setTopUpLoading(false);
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      setError(errorMsg);
      setShowTopUpRedirect(false);
      setTopUpLoading(false);
    }
  };

  const handleCustomTopUp = () => {
    const amount = parseFloat(customTopUpAmount);
    if (isNaN(amount) || amount < 20) {
      setError("Minimalna kwota doładowania to 20 PLN");
      return;
    }
    void handleTopUp(Math.round(amount * 100));
  };

  const getDeliveryStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: BadgeColor; label: string }> = {
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

  const getPaymentStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: BadgeColor; label: string }> = {
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

  if (loading) {
    return <FullPageLoading text="Ładowanie danych..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Panel główny</h1>
      </div>

      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-500/10 dark:border-error-500/20 dark:text-error-400">
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 flex flex-col">
          <div className="h-12 mb-4 text-md font-medium text-gray-600 dark:text-gray-400 leading-tight flex items-start">
            Liczba dostarczonych zleceń
          </div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mt-auto">
            {stats.deliveredOrders}
          </div>
        </div>

        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 flex flex-col">
          <div className="h-12 mb-4 text-md font-medium text-gray-600 dark:text-gray-400 leading-tight flex items-start">
            Zlecenia w trakcie wyboru przez klienta
          </div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mt-auto">
            {stats.clientSelectingOrders}
          </div>
        </div>

        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 flex flex-col">
          <div className="h-12 mb-4 text-md font-medium text-gray-600 dark:text-gray-400 leading-tight flex items-start">
            Zlecenia gotowe do wysyłki
          </div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mt-auto">
            {stats.readyToShipOrders}
          </div>
        </div>

        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 flex flex-col">
          <div className="h-12 mb-4 text-md font-medium text-gray-600 dark:text-gray-400 leading-tight flex items-start">
            Całkowity przychód (PLN)
          </div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mt-auto">
            {formatPriceNumber(stats.totalRevenue)}
          </div>
        </div>
      </div>

      {/* Wallet Section */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Portfel</h2>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Saldo</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {walletBalance !== null ? (walletBalance / 100).toFixed(2) : "0.00"} PLN
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleTopUp(2000)}
              disabled={loading || topUpLoading}
            >
              +20 PLN
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleTopUp(5000)}
              disabled={loading || topUpLoading}
            >
              +50 PLN
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleTopUp(10000)}
              disabled={loading || topUpLoading}
            >
              +100 PLN
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Kwota (min 20 PLN)"
            value={customTopUpAmount}
            onChange={(e) => {
              const formatted = formatCurrencyInput(e.target.value);
              setCustomTopUpAmount(formatted);
            }}
            className="flex-1 h-11 rounded-lg border border-gray-300 px-4 py-2.5 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
          />
          <Button variant="outline" onClick={handleCustomTopUp} disabled={loading || topUpLoading}>
            Doładuj
          </Button>
        </div>
      </div>

      {/* Active Orders List */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Aktywne zlecenia</h2>
          <Button variant="outline" size="sm" onClick={() => setActiveOrdersModalOpen(true)}>
            Zobacz wszystkie
          </Button>
        </div>

        {activeOrders.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">Brak aktywnych zleceń</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Galeria
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Zlecenie
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Status dostawy
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Status płatności
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Kwota
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Data utworzenia
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Akcje
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeOrders.map((order) => {
                  const orderObj: Order = order;
                  const galleryId =
                    typeof orderObj.galleryId === "string" ? orderObj.galleryId : "";
                  const orderId = typeof orderObj.orderId === "string" ? orderObj.orderId : "";
                  const galleryName =
                    typeof orderObj.galleryName === "string" ? orderObj.galleryName : "";
                  const orderNumber =
                    typeof orderObj.orderNumber === "string" ? orderObj.orderNumber : "";
                  const deliveryStatus =
                    typeof orderObj.deliveryStatus === "string" ? orderObj.deliveryStatus : "";
                  const paymentStatus =
                    typeof orderObj.paymentStatus === "string" ? orderObj.paymentStatus : "";
                  const totalCents =
                    typeof orderObj.totalCents === "number" ? orderObj.totalCents : null;
                  const createdAt = orderObj.createdAt;

                  return (
                    <TableRow
                      key={`${galleryId}-${orderId}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <Link
                          href={`/galleries/${galleryId}`}
                          className="text-brand-500 hover:text-brand-600"
                          onClick={() => {
                            // Store current page as referrer when navigating to gallery
                            if (typeof window !== "undefined" && galleryId) {
                              const referrerKey = `gallery_referrer_${galleryId}`;
                              sessionStorage.setItem(referrerKey, window.location.pathname);
                            }
                          }}
                        >
                          {galleryName}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <Link
                          href={`/galleries/${galleryId}/orders/${orderId}`}
                          className="text-brand-500 hover:text-brand-600"
                        >
                          #{orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        {getDeliveryStatusBadge(deliveryStatus)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        {getPaymentStatusBadge(paymentStatus)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {formatPrice(totalCents)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {createdAt ? new Date(createdAt).toLocaleDateString("pl-PL") : "-"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          {deliveryStatus === "CHANGES_REQUESTED" && (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleApproveChangeRequest(galleryId, orderId)}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                Zatwierdź
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDenyChangeRequest(galleryId, orderId)}
                              >
                                Odrzuć
                              </Button>
                            </>
                          )}
                          <Link href={`/galleries/${galleryId}/orders/${orderId}`}>
                            <Button variant="outline" size="sm">
                              Szczegóły
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Orders Modals */}
      <OrdersModal
        isOpen={activeOrdersModalOpen}
        onClose={() => setActiveOrdersModalOpen(false)}
        title="Wszystkie Aktywne Zlecenia"
        excludeDeliveryStatus="DELIVERED"
      />

      {/* Deny Change Request Modal */}
      <DenyChangeRequestModal
        isOpen={denyModalOpen}
        onClose={() => {
          setDenyModalOpen(false);
          setDenyGalleryId(null);
          setDenyOrderId(null);
        }}
        onConfirm={handleDenyConfirm}
        loading={denyLoading}
      />

      {/* Stripe Redirect Overlay for Wallet Top-up */}
      <StripeRedirectOverlay
        isVisible={showTopUpRedirect}
        checkoutUrl={topUpCheckoutUrl}
      />
    </div>
  );
}
