import { useRouter } from "next/router";
import { useEffect } from "react";

import { GallerySettingsForm } from "../../../../../../components/galleries/GallerySettingsForm";

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function OrderSettingsTab() {
  const router = useRouter();
  const { id: galleryId, orderId, tab } = router.query;

  // Redirect to general if no tab specified
  useEffect(() => {
    if (!tab && router.isReady && galleryId && orderId) {
      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
      const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
      void router.replace(`/galleries/${galleryIdStr}/orders/${orderIdStr}/settings/general`);
    }
  }, [tab, galleryId, orderId, router]);

  if (!router.isReady || !galleryId || !orderId) {
    return null;
  }

  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
  const tabStr = Array.isArray(tab) ? tab[0] : tab;

  if (!galleryIdStr || typeof galleryIdStr !== "string" || !orderIdStr || typeof orderIdStr !== "string") {
    return null;
  }

  return (
    <GallerySettingsForm
      galleryId={galleryIdStr}
      defaultTab={tabStr as "general" | "package" | "personalize" | undefined}
    />
  );
}
