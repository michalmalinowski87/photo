import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { apiFetch, formatApiError } from "../lib/api";
import { getIdToken } from "../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import Link from "next/link";

export default function Dashboard() {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(false);
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
  
  // Active orders
  const [activeOrders, setActiveOrders] = useState<any[]>([]);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    
    initializeAuth(
      (token) => {
        setIdToken(token);
      },
      () => {
        redirectToLandingSignIn("/");
      }
    );
  }, []);

  useEffect(() => {
    if (apiUrl && idToken) {
      loadDashboardData();
      loadWalletBalance();
    }
  }, [apiUrl, idToken]);

  const loadDashboardData = async () => {
    if (!apiUrl || !idToken) return;
    
    setLoading(true);
    setError("");
    
    try {
      // Load all orders efficiently in a single call
      const { data: ordersData } = await apiFetch(`${apiUrl}/orders`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      const allOrders = ordersData.items || [];
      
      // Aggregate statistics from all orders
      let deliveredCount = 0;
      let clientSelectingCount = 0;
      let readyToShipCount = 0;
      let totalRevenueCents = 0;
      const allActiveOrders = [];
      
      for (const order of allOrders) {
        if (order.deliveryStatus === "DELIVERED") {
          deliveredCount++;
        } else if (order.deliveryStatus === "CLIENT_SELECTING") {
          clientSelectingCount++;
        } else if (order.deliveryStatus === "PREPARING_FOR_DELIVERY") {
          readyToShipCount++;
        }
        
        totalRevenueCents += order.totalCents || 0;
        
        // Add to active orders if not delivered
        if (order.deliveryStatus !== "DELIVERED") {
          allActiveOrders.push(order);
        }
      }
      
      // Sort active orders by creation date (newest first)
      allActiveOrders.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      
      setStats({
        deliveredOrders: deliveredCount,
        clientSelectingOrders: clientSelectingCount,
        readyToShipOrders: readyToShipCount,
        totalRevenue: totalRevenueCents,
      });
      
      setActiveOrders(allActiveOrders.slice(0, 10)); // Show top 10
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
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
      // Ignore wallet errors
    }
  };

  const handleTopUp = async (amountCents: number) => {
    if (!apiUrl || !idToken) return;
    
    if (amountCents < 2000) {
      setError("Minimalna kwota doładowania to 20 PLN");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const redirectUrl = typeof window !== "undefined"
        ? `${window.location.origin}/?payment=success`
        : "";
      
      const { data } = await apiFetch(`${apiUrl}/payments/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          amountCents,
          type: "wallet_topup",
          redirectUrl,
        }),
      });
      
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setError("Nie otrzymano URL do płatności");
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCustomTopUp = () => {
    const amount = parseFloat(customTopUpAmount);
    if (isNaN(amount) || amount < 20) {
      setError("Minimalna kwota doładowania to 20 PLN");
      return;
    }
    handleTopUp(Math.round(amount * 100));
  };

  const getDeliveryStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: any; label: string }> = {
      CLIENT_SELECTING: { color: "info", label: "Wybór przez klienta" },
      CLIENT_APPROVED: { color: "success", label: "Zatwierdzone" },
      AWAITING_FINAL_PHOTOS: { color: "warning", label: "Oczekuje na finały" },
      CHANGES_REQUESTED: { color: "warning", label: "Prośba o zmiany" },
      PREPARING_FOR_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
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
    const statusMap: Record<string, { color: any; label: string }> = {
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

  if (loading && !stats.deliveredOrders && activeOrders.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Ładowanie...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Panel główny
        </h1>
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
            Całkowity przychód
          </div>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mt-auto">
            {(stats.totalRevenue / 100).toFixed(2)} PLN
          </div>
        </div>
      </div>

      {/* Wallet Section */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Portfel
        </h2>
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
              disabled={loading}
            >
              +20 PLN
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleTopUp(5000)}
              disabled={loading}
            >
              +50 PLN
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleTopUp(10000)}
              disabled={loading}
            >
              +100 PLN
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Kwota (min 20 PLN)"
            value={customTopUpAmount}
            onChange={(e) => setCustomTopUpAmount(e.target.value)}
            min="20"
            step="0.01"
            className="flex-1 h-11 rounded-lg border border-gray-300 px-4 py-2.5 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white"
          />
          <Button
            variant="outline"
            onClick={handleCustomTopUp}
            disabled={loading}
          >
            Doładuj
          </Button>
        </div>
      </div>

      {/* Active Orders List */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Aktywne zlecenia
          </h2>
          <Link href="/galleries">
            <Button variant="outline" size="sm">
              Zobacz wszystkie
            </Button>
          </Link>
        </div>
        
        {activeOrders.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            Brak aktywnych zleceń
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    Galeria
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    Zlecenie
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeOrders.map((order) => (
                  <TableRow
                    key={`${order.galleryId}-${order.orderId}`}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      <Link
                        href={`/galleries/${order.galleryId}`}
                        className="text-brand-500 hover:text-brand-600"
                        onClick={() => {
                          // Store current page as referrer when navigating to gallery
                          if (typeof window !== "undefined") {
                            const referrerKey = `gallery_referrer_${order.galleryId}`;
                            sessionStorage.setItem(referrerKey, window.location.pathname);
                          }
                        }}
                      >
                        {order.galleryName}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      <Link
                        href={`/galleries/${order.galleryId}/orders/${order.orderId}`}
                        className="text-brand-500 hover:text-brand-600"
                      >
                        #{order.orderNumber}
                      </Link>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

