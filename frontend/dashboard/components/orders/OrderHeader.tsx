import Link from "next/link";
import { useRouter } from "next/router";

import { useGallery } from "../../hooks/queries/useGalleries";
import { useOrder } from "../../hooks/queries/useOrders";
import { useGalleryType } from "../hocs/withGalleryType";
import Button from "../ui/button/Button";

import { StatusBadges } from "./StatusBadges";

export function OrderHeader() {
  const router = useRouter();
  const { id: galleryId, orderId: orderIdFromQuery } = router.query;

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
    galleryIdStr ??
    (typeof galleryId === "string" ? galleryId : currentGallery?.galleryId ?? "");

  const effectiveOrderId = typeof order.orderId === "string" ? order.orderId : orderIdForQuery;
  const orderNumber = (order.orderNumber as string | number | undefined) ?? undefined;
  const displayOrderNumber =
    orderNumber ?? (effectiveOrderId ? effectiveOrderId.slice(-8) : effectiveGalleryId.slice(-8));

  return (
    <div className="flex items-center justify-between">
      <div>
        {!isNonSelectionGallery && (
          <Link href={`/galleries/${effectiveGalleryId}`}>
            <Button variant="outline" size="sm">
              ← Powrót do galerii
            </Button>
          </Link>
        )}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
          {isNonSelectionGallery
            ? (gallery?.galleryName ?? "Galeria")
            : `Zlecenie #${String(displayOrderNumber)}`}
        </h1>
      </div>
      <StatusBadges deliveryStatus={order.deliveryStatus} paymentStatus={order.paymentStatus} />
    </div>
  );
}
