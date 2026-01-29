import { useRouter } from "next/router";
import { useEffect } from "react";

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function OrderSettings() {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;

  // Redirect to general tab by default
  useEffect(() => {
    if (router.isReady && galleryId && orderId) {
      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
      const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
      if (galleryIdStr && orderIdStr) {
        void router.replace(`/galleries/${galleryIdStr}/orders/${orderIdStr}/settings/general`);
      }
    }
  }, [router, galleryId, orderId]);

  return null;
}
