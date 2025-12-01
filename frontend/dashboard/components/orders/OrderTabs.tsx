import { normalizeSelectedKeys } from "../../lib/order-utils";
import { useOrderStore } from "../../store/orderSlice";

interface OrderTabsProps {
  activeTab: "originals" | "finals";
  onTabChange: (tab: "originals" | "finals") => void;
  finalsCount: number; // Page-specific state, keep as prop
}

export function OrderTabs({ activeTab, onTabChange, finalsCount }: OrderTabsProps) {
  // Get order from store to calculate originals count
  const order = useOrderStore((state) => state.currentOrder);

  // Defensive check: don't render until order is loaded
  if (!order) {
    return null;
  }

  // Calculate originals count from order.selectedKeys
  const selectedKeys = normalizeSelectedKeys(order.selectedKeys);
  const originalsCount = selectedKeys.length;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <div className="flex gap-4">
        <button
          onClick={() => onTabChange("originals")}
          className={`px-4 py-2 font-medium border-b-2 ${
            activeTab === "originals"
              ? "border-brand-500 text-brand-600 dark:text-brand-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          Wybrane przez klienta ({originalsCount})
        </button>
        <button
          onClick={() => onTabChange("finals")}
          className={`px-4 py-2 font-medium border-b-2 ${
            activeTab === "finals"
              ? "border-brand-500 text-brand-600 dark:text-brand-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          Finały ({finalsCount})
        </button>
      </div>
    </div>
  );
}
