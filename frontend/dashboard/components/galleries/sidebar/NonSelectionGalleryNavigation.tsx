import { Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect } from "react";

import { useGalleryStore, useOrderStore } from "../../../store";

interface NonSelectionGalleryNavigationProps {
  galleryId: string;
}

export const NonSelectionGalleryNavigation: React.FC<NonSelectionGalleryNavigationProps> = ({
  galleryId,
}) => {
  const router = useRouter();
  const isOnOrderPage = router.pathname?.includes("/orders/");
  const { orderId } = router.query;
  const orderIdFromUrl: string | undefined = Array.isArray(orderId) ? orderId[0] : orderId;

  // Subscribe to gallery orders from store - use both cache and state
  // Get orders from orderCache (single source of truth)
  const { getOrdersByGalleryId } = useOrderStore();
  const galleryOrders = galleryId ? getOrdersByGalleryId(galleryId) : [];

  // Get first order ID - use URL orderId if available, otherwise use first order from store
  // This is computed directly from reactive store subscriptions, no need for state
  const firstOrderId =
    orderIdFromUrl ||
    (galleryOrders && galleryOrders.length > 0 ? galleryOrders[0]?.orderId : null);

  // Fetch orders if not available
  useEffect(() => {
    if (!firstOrderId && galleryOrders.length === 0) {
      const { fetchGalleryOrders } = useGalleryStore.getState();
      void fetchGalleryOrders(galleryId);
    }
  }, [galleryId, firstOrderId, galleryOrders.length]);

  const handlePhotosClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!firstOrderId) {
      e.preventDefault();
      // Fetch orders and navigate
      const { fetchGalleryOrders } = useGalleryStore.getState();
      const orders = await fetchGalleryOrders(galleryId);
      if (orders && orders.length > 0) {
        const firstOrder = orders[0] as { orderId?: string } | undefined;
        if (firstOrder?.orderId) {
          void router.push(`/galleries/${galleryId}/orders/${firstOrder.orderId}`);
        }
      }
    }
  };

  const photosHref = firstOrderId
    ? `/galleries/${galleryId}/orders/${firstOrderId}`
    : `/galleries/${galleryId}`; // Fallback to gallery page (will redirect to order)

  return (
    <>
      {/* Photos Link - appears first for non-selection galleries */}
      <li>
        <Link
          href={photosHref}
          onClick={handlePhotosClick}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isOnOrderPage && !router.asPath.includes("/settings")
              ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          <ImageIcon size={20} />
          <span>Zdjęcia</span>
        </Link>
      </li>
    </>
  );
};
