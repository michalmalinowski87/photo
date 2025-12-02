import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect } from "react";

import { useGalleryStore } from "../../../store/gallerySlice";

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
  const galleryOrdersCacheEntry = useGalleryStore((state) =>
    galleryId ? state.galleryOrdersCache[galleryId] : null
  );
  const galleryOrdersState = useGalleryStore((state) => state.galleryOrders);
  
  // Get orders from cache or state
  const galleryOrders = galleryOrdersCacheEntry
    ? (galleryOrdersCacheEntry.orders as Array<{ orderId?: string }>)
    : galleryOrdersState && Array.isArray(galleryOrdersState) && galleryOrdersState.length > 0
      ? (galleryOrdersState as Array<{ orderId?: string }>)
      : [];
  
  // Get first order ID - use URL orderId if available, otherwise use first order from store
  // This is computed directly from reactive store subscriptions, no need for state
  const firstOrderId = orderIdFromUrl || (galleryOrders && galleryOrders.length > 0 ? galleryOrders[0]?.orderId : null);

  // Fetch orders if not available
  useEffect(() => {
    if (!firstOrderId && galleryOrders.length === 0) {
      const { fetchGalleryOrders } = useGalleryStore.getState();
      void fetchGalleryOrders(galleryId, false);
    }
  }, [galleryId, firstOrderId, galleryOrders.length]);

  const handlePhotosClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!firstOrderId) {
      e.preventDefault();
      // Fetch orders and navigate
      const { fetchGalleryOrders } = useGalleryStore.getState();
      const orders = await fetchGalleryOrders(galleryId, false);
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
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 3C2.89543 3 2 3.89543 2 5V15C2 16.1046 2.89543 17 4 17H16C17.1046 17 18 16.1046 18 15V5C18 3.89543 17.1046 3 16 3H4ZM4 5H16V15H4V5ZM6 7C5.44772 7 5 7.44772 5 8C5 8.55228 5.44772 9 6 9C6.55228 9 7 8.55228 7 8C7 7.44772 6.55228 7 6 7ZM8 11L10.5 8.5L13 11L15 9V13H5V9L8 11Z"
              fill="currentColor"
            />
          </svg>
          <span>Zdjęcia</span>
        </Link>
      </li>
    </>
  );
};

