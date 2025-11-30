import Link from "next/link";
import Button from "../ui/button/Button";
import { StatusBadges } from "./StatusBadges";

interface OrderHeaderProps {
  galleryId: string | string[] | undefined;
  orderId: string | string[] | undefined;
  orderNumber?: string;
  orderIdFallback?: string;
  deliveryStatus?: string;
  paymentStatus?: string;
}

export function OrderHeader({
  galleryId,
  orderNumber,
  orderIdFallback,
  deliveryStatus,
  paymentStatus,
}: OrderHeaderProps) {
  const displayOrderNumber =
    orderNumber ??
    (orderIdFallback
      ? orderIdFallback.slice(-8)
      : Array.isArray(galleryId) && galleryId[0] ? galleryId[0].slice(-8) : "");

  return (
    <div className="flex items-center justify-between">
      <div>
        <Link
          href={`/galleries/${Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "")}`}
        >
          <Button variant="outline" size="sm">
            ← Powrót do galerii
          </Button>
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
          Zlecenie #{displayOrderNumber}
        </h1>
      </div>
      <StatusBadges deliveryStatus={deliveryStatus} paymentStatus={paymentStatus} />
    </div>
  );
}

