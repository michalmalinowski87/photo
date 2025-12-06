import { Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect } from "react";

import { useOrders } from "../../../hooks/queries/useOrders";
import { usePrefetchOrder } from "../../../hooks/usePrefetch";

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

  // Use React Query for orders
  const { data: galleryOrders = [], refetch: refetchOrders } = useOrders(galleryId);

  // Prefetch hook for order details
  const prefetchOrder = usePrefetchOrder();

  // Get first order ID - use URL orderId if available, otherwise use first order from React Query
  const firstOrderId =
    orderIdFromUrl ??
    (galleryOrders?.length > 0 ? galleryOrders[0]?.orderId : null);

  // Refetch orders if not available
  useEffect(() => {
    if (!firstOrderId && galleryOrders.length === 0) {
      void refetchOrders();
    }
  }, [galleryId, firstOrderId, galleryOrders.length, refetchOrders]);

  const handlePhotosClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!firstOrderId) {
      e.preventDefault();
      // Refetch orders and navigate
      const result = await refetchOrders();
      const orders = result.data ?? [];
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
          onMouseEnter={() => {
            if (firstOrderId) {
              prefetchOrder(galleryId, firstOrderId);
            }
          }}
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
