import { useRouter } from "next/router";
import React from "react";

import { useGalleryStore, useOrderStore } from "../../../store";
import { useGalleryType } from "../../hocs/withGalleryType";

import { GallerySettingsLink } from "./GallerySettingsLink";
import { NonSelectionGalleryNavigation } from "./NonSelectionGalleryNavigation";
import { SelectionGalleryNavigation } from "./SelectionGalleryNavigation";

export const GalleryNavigation: React.FC = () => {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;

  // Don't show loading if we're not on a gallery route
  const isOnGalleryRoute =
    router.pathname?.includes("/galleries/") || router.asPath?.includes("/galleries/");

  // Check store directly to avoid subscription timing issues
  const storeGallery = useGalleryStore.getState().currentGallery;
  const storeIsLoading = useGalleryStore.getState().isLoading;

  // Use gallery from store directly (most reliable)
  const gallery = storeGallery?.galleryId === galleryIdStr ? storeGallery : storeGallery;

  // Also subscribe for reactivity, but use direct store check for loading decision
  const { isNonSelectionGallery } = useGalleryType();
  const orderIdStr: string | undefined = Array.isArray(orderId) ? orderId[0] : orderId;
  const { getOrdersByGalleryId } = useOrderStore();

  // Check if there are delivered orders - use orderCache (single source of truth)
  const hasDeliveredOrders = React.useMemo(() => {
    if (!gallery?.galleryId) {
      return false;
    }
    const orders = getOrdersByGalleryId(gallery.galleryId);
    if (!orders || orders.length === 0) {
      return false;
    }
    return orders.some((o: { deliveryStatus?: string }) => o.deliveryStatus === "DELIVERED");
  }, [gallery?.galleryId, getOrdersByGalleryId]);

  // Only show loading if we're on a gallery route AND:
  // - Store is actively loading AND we don't have gallery in store
  // - We don't have gallery AND we have galleryId (should be loading)
  // Check store directly to avoid race conditions
  const shouldShowLoading =
    isOnGalleryRoute && ((storeIsLoading && !storeGallery) || (!storeGallery && galleryIdStr));

  if (shouldShowLoading) {
    return (
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1">
          <li>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600">
              <span>Ładowanie...</span>
            </div>
          </li>
        </ul>
      </nav>
    );
  }

  // If we're not on a gallery route, return null (sidebar shouldn't show navigation)
  if (!isOnGalleryRoute) {
    return null;
  }

  // If we don't have gallery data, return null
  if (!gallery) {
    return null;
  }

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      <ul className="space-y-1">
        {isNonSelectionGallery ? (
          <NonSelectionGalleryNavigation galleryId={gallery.galleryId} />
        ) : (
          <SelectionGalleryNavigation galleryId={gallery.galleryId} />
        )}
        <GallerySettingsLink
          galleryId={gallery.galleryId}
          orderId={orderIdStr}
          hasDeliveredOrders={hasDeliveredOrders}
        />
      </ul>
    </nav>
  );
};
