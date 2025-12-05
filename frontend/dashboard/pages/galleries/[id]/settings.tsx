import { useRouter } from "next/router";
import { useEffect } from "react";

import { GallerySettingsForm } from "../../../components/galleries/GallerySettingsForm";

export default function GallerySettings() {
  const router = useRouter();
  const { id: galleryId } = router.query;

  // Auth is handled by AuthProvider/ProtectedRoute - no initialization needed

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
