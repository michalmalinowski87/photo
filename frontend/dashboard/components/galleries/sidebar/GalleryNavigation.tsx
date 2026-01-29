import { useRouter } from "next/router";
import React from "react";

import { useGallery } from "../../../hooks/queries/useGalleries";
import { useOrders } from "../../../hooks/queries/useOrders";
import { useGalleryType } from "../../hocs/withGalleryType";

import { GallerySettingsLink } from "./GallerySettingsLink";
import { NonSelectionGalleryNavigation } from "./NonSelectionGalleryNavigation";
import { SelectionGalleryNavigation } from "./SelectionGalleryNavigation";

export const GalleryNavigation = () => {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  // Don't show loading if we're not on a gallery route
  const isOnGalleryRoute =
    router.pathname?.includes("/galleries/") || router.asPath?.includes("/galleries/");

  // Use React Query hooks
  const { data: gallery, isLoading: galleryLoading } = useGallery(galleryIdForQuery);
  const { data: orders = [] } = useOrders(galleryIdForQuery);

  const { isNonSelectionGallery } = useGalleryType();
  const orderIdStr: string | undefined = Array.isArray(orderId) ? orderId[0] : orderId;

  // Check if gallery has any order in Delivered or Preparing Delivery (don't show watermark warning in those cases)
  const hasDeliveredOrders = React.useMemo(() => {
    if (!gallery?.galleryId || !orders || orders.length === 0) {
      return false;
    }
    return orders.some(
      (o: { deliveryStatus?: string }) =>
        o.deliveryStatus === "DELIVERED" || o.deliveryStatus === "PREPARING_DELIVERY"
    );
  }, [gallery?.galleryId, orders]);

  // Show loading if we're on a gallery route and React Query is loading
  const shouldShowLoading = isOnGalleryRoute && galleryLoading && !gallery;

  if (shouldShowLoading) {
    return (
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5">
          <li>
            <div className="flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium text-gray-400 dark:text-gray-600">
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
    <nav className="flex-1 overflow-y-auto py-3">
      <ul className="space-y-0.5">
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
