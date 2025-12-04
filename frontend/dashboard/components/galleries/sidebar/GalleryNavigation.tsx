import { useRouter } from "next/router";
import React from "react";

import { useGalleryStore } from "../../../store";
import { useGalleryType } from "../../hocs/withGalleryType";

import { GallerySettingsLink } from "./GallerySettingsLink";
import { NonSelectionGalleryNavigation } from "./NonSelectionGalleryNavigation";
import { SelectionGalleryNavigation } from "./SelectionGalleryNavigation";

export const GalleryNavigation: React.FC = () => {
  const gallery = useGalleryStore((state) => state.currentGallery);
  const isLoading = useGalleryStore((state) => state.isLoading);
  const { isNonSelectionGallery } = useGalleryType();
  const router = useRouter();
  const { orderId } = router.query;
  const orderIdStr: string | undefined = Array.isArray(orderId) ? orderId[0] : orderId;

  // Check if there are delivered orders
  const hasDeliveredOrders = useGalleryStore((state) => {
    const orders = state.getGalleryOrders(gallery?.galleryId ?? "", 30000);
    if (!orders || orders.length === 0) {
      return false;
    }
    return orders.some((o: { deliveryStatus?: string }) => o.deliveryStatus === "DELIVERED");
  });

  if (isLoading || !gallery?.galleryId) {
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
