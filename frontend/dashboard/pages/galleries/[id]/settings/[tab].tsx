import { useRouter } from "next/router";
import { useEffect } from "react";

import { GallerySettingsForm } from "../../../../components/galleries/GallerySettingsForm";

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function GallerySettingsTab() {
  const router = useRouter();
  const { id: galleryId, tab } = router.query;

  // Redirect to general if no tab specified
  useEffect(() => {
    if (!tab && router.isReady && galleryId) {
      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
      void router.replace(`/galleries/${galleryIdStr}/settings/general`);
    }
  }, [tab, galleryId, router]);

  if (!router.isReady || !galleryId) {
    return null;
  }

  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const tabStr = Array.isArray(tab) ? tab[0] : tab;

  if (!galleryIdStr || typeof galleryIdStr !== "string") {
    return null;
  }

  return (
    <GallerySettingsForm
      galleryId={galleryIdStr}
      cancelLabel="Anuluj"
      cancelHref={`/galleries/${galleryIdStr}`}
      defaultTab={tabStr as "general" | "package" | "personalize" | undefined}
    />
  );
}
