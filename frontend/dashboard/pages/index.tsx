import { useQueryClient } from "@tanstack/react-query";
import type { GetServerSideProps } from "next";
import { useState } from "react";

import { ActiveOrdersTable } from "../components/dashboard/ActiveOrdersTable";
import { StatisticsCard } from "../components/dashboard/StatisticsCard";
import { DenyChangeRequestModal } from "../components/orders/DenyChangeRequestModal";
import { OrdersModal } from "../components/orders/OrdersModal";
import { WalletTopUpSection } from "../components/wallet/WalletTopUpSection";
import {
  useApproveChangeRequest,
  useDenyChangeRequest,
} from "../hooks/mutations/useOrderMutations";
import { useActiveOrders, useDashboardStats } from "../hooks/queries/useDashboard";
import { useWalletBalance } from "../hooks/queries/useWallet";
import { formatPriceNumber } from "../lib/format-price";
import { queryKeys } from "../lib/react-query";

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function Dashboard() {
  const queryClient = useQueryClient();

  // React Query hooks for data fetching
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: walletBalanceData, isLoading: walletLoading } = useWalletBalance();
  const {
    data: activeOrders = [],
    isLoading: ordersLoading,
    error: ordersError,
  } = useActiveOrders({ page: 1, itemsPerPage: 5, excludeDeliveryStatus: "DELIVERED" });

  // Mutations
  const approveChangeRequestMutation = useApproveChangeRequest();
  const denyChangeRequestMutation = useDenyChangeRequest();

  // Modal states
  const [activeOrdersModalOpen, setActiveOrdersModalOpen] = useState(false);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyGalleryId, setDenyGalleryId] = useState<string | null>(null);
  const [denyOrderId, setDenyOrderId] = useState<string | null>(null);

  // Combined loading state
  const loading = statsLoading || walletLoading || ordersLoading;
  const error = statsError ?? ordersError;

  const handleApproveChangeRequest = async (galleryId: string, orderId: string) => {
    if (!galleryId || !orderId) {
      return;
    }

    try {
      await approveChangeRequestMutation.mutateAsync({ galleryId, orderId });
      // Invalidate active orders to refetch
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.activeOrders({
          page: 1,
          itemsPerPage: 5,
          excludeDeliveryStatus: "DELIVERED",
        }),
      });
    } catch {
      // Error is handled by React Query
    }
  };

  const handleDenyChangeRequest = (galleryId: string, orderId: string) => {
    setDenyGalleryId(galleryId);
    setDenyOrderId(orderId);
    setDenyModalOpen(true);
  };

  const handleDenyConfirm = async (reason?: string, preventFutureChangeRequests?: boolean) => {
    if (!denyGalleryId || !denyOrderId) {
      return;
    }

    try {
      await denyChangeRequestMutation.mutateAsync({
        galleryId: denyGalleryId,
        orderId: denyOrderId,
        reason,
        preventFutureChangeRequests,
      });
      // Invalidate active orders to refetch
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.activeOrders({
          page: 1,
          itemsPerPage: 5,
          excludeDeliveryStatus: "DELIVERED",
        }),
      });
      setDenyModalOpen(false);
      setDenyGalleryId(null);
      setDenyOrderId(null);
    } catch {
      // Error is handled by React Query
    }
  };

  const handleTopUpComplete = (): void => {
    // Invalidate wallet balance to refetch
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
  };

  const walletBalance = walletBalanceData?.balanceCents ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Panel główny</h1>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error instanceof Error ? error.message : "Wystąpił błąd podczas ładowania danych"}
        </div>
      )}

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
            <StatisticsCard
              title="Liczba dostarczonych zleceń"
              value={stats?.deliveredOrders ?? 0}
            />
            <StatisticsCard
              title="Zlecenia w trakcie wyboru przez klienta"
              value={stats?.clientSelectingOrders ?? 0}
            />
            <StatisticsCard
              title="Zlecenia gotowe do wysyłki"
              value={stats?.readyToShipOrders ?? 0}
            />
            <StatisticsCard
              title="Całkowity przychód (PLN)"
              value={formatPriceNumber(stats?.totalRevenue ?? 0)}
            />
          </div>

          {/* Wallet Section */}
          <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Portfel</h2>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Saldo</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {(walletBalance / 100).toFixed(2)} PLN
                </div>
              </div>
            </div>
            <WalletTopUpSection
              onTopUp={handleTopUpComplete}
              isLoading={walletLoading}
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
        loading={denyChangeRequestMutation.isPending}
      />
    </div>
  );
}
