import { useRouter } from "next/router";

import { useGallery } from "../../hooks/queries/useGalleries";
import { useOrder } from "../../hooks/queries/useOrders";
import { useNavigation } from "../../hooks/useNavigation";
import { formatOrderDisplay } from "../../lib/orderDisplay";
import { useGalleryType } from "../hocs/withGalleryType";
import Button from "../ui/button/Button";

import { StatusBadges } from "./StatusBadges";

export function OrderHeader() {
  const router = useRouter();
  const { id: galleryId, orderId: orderIdFromQuery } = router.query;
  const { navigate } = useNavigation();

  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const orderIdStr = Array.isArray(orderIdFromQuery) ? orderIdFromQuery[0] : orderIdFromQuery;
  const orderIdForQuery = orderIdStr && typeof orderIdStr === "string" ? orderIdStr : undefined;

  // Use React Query for order and gallery data
  const { data: order } = useOrder(galleryIdForQuery, orderIdForQuery);
  const { data: currentGallery } = useGallery(galleryIdForQuery);
  const { isNonSelectionGallery, gallery } = useGalleryType();

  // Defensive check: don't render until order is loaded
  if (!order) {
    return null;
  }

  const effectiveGalleryId =
    galleryIdStr ?? (typeof galleryId === "string" ? galleryId : (currentGallery?.galleryId ?? ""));

  const displayOrderNumber = formatOrderDisplay(order);

  const handleBackToGallery = () => {
    if (effectiveGalleryId) {
      void navigate(`/galleries/${effectiveGalleryId}`);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        {!isNonSelectionGallery && (
          <Button variant="outline" size="sm" onClick={handleBackToGallery}>
            ← Powrót do galerii
          </Button>
        )}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
          {isNonSelectionGallery
            ? typeof gallery?.galleryName === "string"
              ? gallery.galleryName
              : "Galeria"
            : `Zlecenie #${String(displayOrderNumber)}`}
        </h1>
      </div>
      <StatusBadges deliveryStatus={order.deliveryStatus} paymentStatus={order.paymentStatus} />
    </div>
  );
}
