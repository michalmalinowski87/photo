import { useRouter } from "next/router";
import { useEffect } from "react";

import { GallerySettingsForm } from "../../../../../components/galleries/GallerySettingsForm";

export default function OrderSettings() {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;

  // Auth is handled by AuthProvider/ProtectedRoute - no initialization needed

  const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
  const orderIdStr = Array.isArray(orderId) ? (orderId[0] ?? "") : (orderId ?? "");

  if (!galleryIdStr || !orderIdStr) {
    return null;
  }

  return (
    <GallerySettingsForm
      galleryId={galleryIdStr}
      cancelLabel="Powrót do zlecenia"
      cancelHref={`/galleries/${galleryIdStr}/orders/${orderIdStr}`}
    />
  );
}
