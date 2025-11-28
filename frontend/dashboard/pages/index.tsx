import { useState, useEffect } from "react";

import { ActiveOrdersTable } from "../components/dashboard/ActiveOrdersTable";
import { StatisticsCard } from "../components/dashboard/StatisticsCard";
import { DenyChangeRequestModal } from "../components/orders/DenyChangeRequestModal";
import { OrdersModal } from "../components/orders/OrdersModal";
import { FullPageLoading } from "../components/ui/loading/Loading";
import { WalletTopUpSection } from "../components/wallet/WalletTopUpSection";
import api, { formatApiError } from "../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import { formatPriceNumber } from "../lib/format-price";

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
