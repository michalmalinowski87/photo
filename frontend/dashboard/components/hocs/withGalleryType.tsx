import { useRouter } from "next/router";

import { useGallery } from "../../hooks/queries/useGalleries";

/**
 * Hook to get gallery type information
 */
export function useGalleryType() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const { data: gallery } = useGallery(galleryIdForQuery);
  const isNonSelectionGallery = gallery?.selectionEnabled === false;

  return {
    isNonSelectionGallery,
    gallery: gallery ?? null,
    isSelectionGallery: !isNonSelectionGallery,
  };
}

