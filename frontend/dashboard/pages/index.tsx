import { useState, useEffect } from "react";

import { ActiveOrdersTable } from "../components/dashboard/ActiveOrdersTable";
import { StatisticsCard } from "../components/dashboard/StatisticsCard";
import { DenyChangeRequestModal } from "../components/orders/DenyChangeRequestModal";
import { OrdersModal } from "../components/orders/OrdersModal";
import { WalletTopUpSection } from "../components/wallet/WalletTopUpSection";
import api, { formatApiError } from "../lib/api-service";
import { formatPriceNumber } from "../lib/format-price";
import { storeLogger } from "../lib/store-logger";

interface Order {
  orderId?: string;
  galleryId?: string;
  galleryName?: string;
  gallerySelectionEnabled?: boolean;
  orderNumber?: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  totalCents?: number;
  createdAt?: string | number | Date;
  [key: string]: unknown;
}

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

  // Active orders
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);

  // Modal states
  const [activeOrdersModalOpen, setActiveOrdersModalOpen] = useState(false);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyLoading, setDenyLoading] = useState(false);
  const [denyGalleryId, setDenyGalleryId] = useState<string | null>(null);
  const [denyOrderId, setDenyOrderId] = useState<string | null>(null);

  const loadDashboardData = async () => {
    storeLogger.logAction("dashboard", "loadDashboardData", {}, {});
    storeLogger.logLoadingState("dashboard", "loadDashboardData", true);
    setLoading(true);
    setError("");

    try {
      storeLogger.log("dashboard", "Loading dashboard stats", {});
      // Load dashboard statistics (computed on backend)
      const statsData = await api.dashboard.getStats();

      storeLogger.log("dashboard", "Loading active orders", {
        excludeDeliveryStatus: "DELIVERED",
        page: 1,
        itemsPerPage: 5,
      });
      // Load active orders (non-delivered) with pagination
      const activeOrdersData = await api.orders.list({
        excludeDeliveryStatus: "DELIVERED",
        page: 1,
        itemsPerPage: 5,
      });

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

      // Set stats from API response
      setStats({
        deliveredOrders: statsData.deliveredOrders || 0,
        clientSelectingOrders: statsData.clientSelectingOrders || 0,
        readyToShipOrders: statsData.readyToShipOrders || 0,
        totalRevenue: statsData.totalRevenue || 0,
      });
      setActiveOrders(activeOrders);

      storeLogger.log("dashboard", "Dashboard data loaded", {
        activeOrdersCount: activeOrders.length,
        stats: statsData,
      });
    } catch (err) {
      const errorMsg = formatApiError(err);
      storeLogger.log("dashboard", "Error loading dashboard data", { error: errorMsg }, "error");
      setError(errorMsg);
    } finally {
      storeLogger.logLoadingState("dashboard", "loadDashboardData", false);
      setLoading(false);
    }
  };

  const loadWalletBalance = async () => {
    storeLogger.logAction("dashboard", "loadWalletBalance", {}, {});
    storeLogger.log("dashboard", "Loading wallet balance", {});
    try {
      const data = await api.wallet.getBalance();
      const balance = data.balanceCents || 0;
      storeLogger.log("dashboard", "Wallet balance loaded", {
        balanceCents: balance,
        balancePLN: (balance / 100).toFixed(2),
      });
      setWalletBalance(balance);
    } catch (err) {
      storeLogger.log("dashboard", "Error loading wallet balance", { error: String(err) }, "warn");
      // Ignore wallet errors
    }
  };

  useEffect(() => {
    storeLogger.log("dashboard", "Dashboard component mounted", {});
    storeLogger.log("dashboard", "Loading dashboard data", {});
    // Auth is handled by AuthProvider/ProtectedRoute - just load data
    void loadDashboardData();
    void loadWalletBalance();
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

  const handleTopUpComplete = (): void => {
    void loadWalletBalance();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Panel główny</h1>
      </div>

      {error && <div>{error}</div>}

      {loading ? (
        <>
          {/* Statistics Cards Skeleton */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-32 animate-fade-in-out"
              ></div>
            ))}
          </div>

          {/* Wallet Section Skeleton */}
          <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-64 animate-fade-in-out"></div>

          {/* Active Orders Table Skeleton */}
          <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-96 animate-fade-in-out"></div>
        </>
      ) : (
        <>
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatisticsCard title="Liczba dostarczonych zleceń" value={stats.deliveredOrders} />
            <StatisticsCard
              title="Zlecenia w trakcie wyboru przez klienta"
              value={stats.clientSelectingOrders}
            />
            <StatisticsCard title="Zlecenia gotowe do wysyłki" value={stats.readyToShipOrders} />
            <StatisticsCard
              title="Całkowity przychód (PLN)"
              value={formatPriceNumber(stats.totalRevenue)}
            />
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
            </div>
            <WalletTopUpSection
              onTopUp={handleTopUpComplete}
              isLoading={loading}
              quickAmounts={[2000, 5000, 10000]}
              showCustomInput={true}
            />
          </div>

          {/* Active Orders List */}
          <ActiveOrdersTable
            orders={activeOrders}
            onApproveChangeRequest={handleApproveChangeRequest}
            onDenyChangeRequest={handleDenyChangeRequest}
            onViewAllClick={() => setActiveOrdersModalOpen(true)}
          />
        </>
      )}

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
    </div>
  );
}
