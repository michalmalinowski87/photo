import { useRouter } from "next/router";
import { useEffect } from "react";

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function GallerySettings() {
  const router = useRouter();
  const { id: galleryId } = router.query;

  // Redirect to general tab by default
  useEffect(() => {
    if (router.isReady && galleryId) {
      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
      if (galleryIdStr) {
        void router.replace(`/galleries/${galleryIdStr}/settings/general`);
      }
    }
  }, [router, galleryId]);

  return null;
}
