import { useRouter } from "next/router";

import { useOrder } from "../../hooks/queries/useOrders";
import { normalizeSelectedKeys } from "../../lib/order-utils";

interface OrderTabsProps {
  activeTab: "originals" | "finals";
  onTabChange: (tab: "originals" | "finals") => void;
  finalsCount: number; // Page-specific state, keep as prop
}

export function OrderTabs({ activeTab, onTabChange, finalsCount }: OrderTabsProps) {
  const router = useRouter();
  const { id: galleryId, orderId: orderIdFromQuery } = router.query;

  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const orderIdStr = Array.isArray(orderIdFromQuery) ? orderIdFromQuery[0] : orderIdFromQuery;
  const orderIdForQuery = orderIdStr && typeof orderIdStr === "string" ? orderIdStr : undefined;

  // Get order from React Query
  const { data: order } = useOrder(galleryIdForQuery, orderIdForQuery);

  // Defensive check: don't render until order is loaded
  if (!order) {
    return null;
  }

  // Calculate originals count from order.selectedKeys
  const selectedKeys = normalizeSelectedKeys(order.selectedKeys);
  const originalsCount = selectedKeys.length;

  return (
    <div className="flex gap-4">
      <button
        onClick={() => onTabChange("originals")}
        className={`px-4 py-2 font-medium border-b-2 ${
          activeTab === "originals"
            ? "border-photographer-accent text-photographer-accent dark:text-photographer-accent"
            : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        }`}
      >
        Wybrane przez klienta ({originalsCount})
      </button>
      <button
        onClick={() => onTabChange("finals")}
        className={`px-4 py-2 font-medium border-b-2 ${
          activeTab === "finals"
            ? "border-photographer-accent text-photographer-accent dark:text-photographer-accent"
            : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        }`}
      >
        Finały ({finalsCount})
      </button>
    </div>
  );
}
