import Link from "next/link";
import { useRouter } from "next/router";

import { useGalleryStore, useOrderStore } from "../../store";
import { useGalleryType } from "../hocs/withGalleryType";
import Button from "../ui/button/Button";

import { StatusBadges } from "./StatusBadges";

export function OrderHeader() {
  const router = useRouter();
  const { id: galleryId } = router.query;

  // Subscribe to stores for order and gallery data
  const order = useOrderStore((state) => state.currentOrder);
  const currentGallery = useGalleryStore((state) => state.currentGallery);
  const { isNonSelectionGallery, gallery } = useGalleryType();

  // Defensive check: don't render until order is loaded
  if (!order) {
    return null;
  }

  const galleryIdStr = Array.isArray(galleryId)
    ? galleryId[0]
    : (galleryId ?? currentGallery?.galleryId ?? "");

  const orderId = typeof order.orderId === "string" ? order.orderId : undefined;
  const orderNumber = (order.orderNumber as string | number | undefined) ?? undefined;
  const displayOrderNumber = orderNumber ?? (orderId ? orderId.slice(-8) : galleryIdStr.slice(-8));

  return (
    <div className="flex items-center justify-between">
      <div>
        {!isNonSelectionGallery && (
          <Link href={`/galleries/${galleryIdStr}`}>
            <Button variant="outline" size="sm">
              ← Powrót do galerii
            </Button>
          </Link>
        )}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
          {isNonSelectionGallery
            ? (gallery?.galleryName ?? "Galeria")
            : `Zlecenie #${displayOrderNumber}`}
        </h1>
      </div>
      <StatusBadges deliveryStatus={order.deliveryStatus} paymentStatus={order.paymentStatus} />
    </div>
  );
}
