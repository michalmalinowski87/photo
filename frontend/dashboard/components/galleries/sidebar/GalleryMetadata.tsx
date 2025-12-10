import { useRouter } from "next/router";
import React from "react";

import { useGallery } from "../../../hooks/queries/useGalleries";

interface GalleryMetadataProps {
  shouldHideSecondaryElements: boolean;
}

export const GalleryMetadata = ({
  shouldHideSecondaryElements,
}: GalleryMetadataProps) => {
  // Use React Query hook for gallery data
  const router = useRouter();
  const { id: galleryId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  const { data: gallery, isLoading } = useGallery(galleryIdForQuery);

  // Don't render until gallery data is loaded
  if (isLoading || !gallery || shouldHideSecondaryElements) {
    return null;
  }

  const isPaid = gallery?.isPaid ?? false;

  // Calculate expiry date
  const getExpiryDate = (): Date | null => {
    let expiryDate: Date | null = null;

    if (!isPaid) {
      // UNPAID draft: 3 days from creation (TTL expiry)
      if (gallery.ttlExpiresAt && typeof gallery.ttlExpiresAt === "string") {
        expiryDate = new Date(gallery.ttlExpiresAt);
      } else if (gallery.ttl && typeof gallery.ttl === "number") {
        // TTL is in Unix epoch seconds
        expiryDate = new Date(gallery.ttl * 1000);
      } else if (gallery.createdAt && typeof gallery.createdAt === "string") {
        // Fallback: calculate 3 days from creation
        expiryDate = new Date(new Date(gallery.createdAt).getTime() + 3 * 24 * 60 * 60 * 1000);
      }
    } else {
      // PAID: use expiresAt from plan
      if (gallery.expiresAt && typeof gallery.expiresAt === "string") {
        expiryDate = new Date(gallery.expiresAt);
      }
    }

    return expiryDate;
  };

  const expiryDate = getExpiryDate();

  const formattedCreatedDate =
    gallery.createdAt && typeof gallery.createdAt === "string"
      ? new Date(gallery.createdAt).toLocaleDateString("pl-PL", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";

  const formattedExpiryDate = expiryDate
    ? expiryDate.toLocaleDateString("pl-PL", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  return (
    <div className="py-3 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1.5">Utworzono:</div>
          <div className="text-base text-gray-900 dark:text-white">{formattedCreatedDate}</div>
        </div>
        <div className="flex-1">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1.5">Ważna do:</div>
          <div className="text-base text-gray-900 dark:text-white">{formattedExpiryDate}</div>
        </div>
      </div>
    </div>
  );
};
