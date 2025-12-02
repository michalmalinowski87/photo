import { useRouter } from "next/router";
import { useEffect } from "react";

import { GallerySettingsForm } from "../../../components/galleries/GallerySettingsForm";
import { initializeAuth, redirectToLandingSignIn } from "../../../lib/auth-init";

export default function GallerySettings() {
  const router = useRouter();
  const { id: galleryId } = router.query;

  useEffect(() => {
    initializeAuth(
      () => {
        // Auth successful, component will render
      },
      () => {
        const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
        redirectToLandingSignIn(`/galleries/${galleryIdStr}/settings`);
      }
    );
  }, [galleryId]);

  const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");

  if (!galleryIdStr) {
    return null;
  }

  return (
    <GallerySettingsForm
      galleryId={galleryIdStr}
      cancelLabel="Anuluj"
      cancelHref={`/galleries/${galleryIdStr}`}
    />
  );
}
