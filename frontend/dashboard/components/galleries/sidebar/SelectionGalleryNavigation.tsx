import { FileText, Image as ImageIcon, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import React, { useMemo } from "react";

import { useOrders } from "../../../hooks/queries/useOrders";
import { useGalleryRoute } from "../../../hooks/useGalleryRoute";
import { useNavigation } from "../../../hooks/useNavigation";

interface SelectionGalleryNavigationProps {
  galleryId: string;
}

export const SelectionGalleryNavigation = ({
  galleryId,
}: SelectionGalleryNavigationProps) => {
  const galleryRoute = useGalleryRoute();
  const { navigate } = useNavigation();
  const { data: orders = [] } = useOrders(galleryId);

  const isOrdersActive = galleryRoute.isGalleryDetail;
  const isPhotosActive = galleryRoute.isGalleryPhotos;

  // Calculate order status indicator
  const orderStatusIndicator = useMemo(() => {
    if (!orders || orders.length === 0) {
      return null;
    }

    // Check if at least one order has CHANGES_REQUESTED status
    const hasChangesRequested = orders.some(
      (order) => order.deliveryStatus === "CHANGES_REQUESTED"
    );

    if (hasChangesRequested) {
      return (
        <AlertTriangle size={20} className="text-orange-500 dark:text-orange-400 flex-shrink-0" />
      );
    }

    // Check if all orders are delivered
    const allDelivered = orders.every((order) => order.deliveryStatus === "DELIVERED");

    if (allDelivered) {
      return (
        <CheckCircle2 size={20} className="text-green-500 dark:text-green-400 flex-shrink-0" />
      );
    }

    // Not all orders are delivered (but none with CHANGES_REQUESTED)
    return <Info size={20} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />;
  }, [orders]);

  const handleOrdersClick = () => {
    void navigate(`/galleries/${galleryId}`);
  };

  const handlePhotosClick = () => {
    void navigate(`/galleries/${galleryId}/photos`);
  };

  return (
    <>
      {/* Orders Link */}
      <li>
        <button
          onClick={handleOrdersClick}
          className={`flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-colors w-full text-left ${
            isOrdersActive
              ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          <FileText size={26} className="flex-shrink-0" />
          <span className="flex-shrink-0 whitespace-nowrap">Zlecenia</span>
          {orderStatusIndicator && (
            <span className="ml-auto flex-shrink-0">{orderStatusIndicator}</span>
          )}
        </button>
      </li>

      {/* Photos Link */}
      <li>
        <button
          onClick={handlePhotosClick}
          className={`flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-colors w-full text-left ${
            isPhotosActive
              ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          <ImageIcon size={26} />
          <span>Zdjęcia</span>
        </button>
      </li>
    </>
  );
};
