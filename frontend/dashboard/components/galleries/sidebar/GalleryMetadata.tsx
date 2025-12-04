import React from "react";

import { useGalleryStore } from "../../../store";

interface GalleryMetadataProps {
  shouldHideSecondaryElements: boolean;
}

export const GalleryMetadata: React.FC<GalleryMetadataProps> = ({
  shouldHideSecondaryElements,
}) => {
  // Defensive check: subscribe to store and check if data is loaded
  const gallery = useGalleryStore((state) => state.currentGallery);
  const isLoading = useGalleryStore((state) => state.isLoading);

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

  return (
    <>
      {/* Creation Date */}
      <div className="py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Utworzono:</div>
        <div className="text-sm text-gray-900 dark:text-white">
          {gallery.createdAt && typeof gallery.createdAt === "string"
            ? new Date(gallery.createdAt).toLocaleDateString("pl-PL", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-"}
        </div>
      </div>

      {/* Expiry Date */}
      <div className="py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Ważna do:</div>
        <div className="text-sm text-gray-900 dark:text-white">
          {expiryDate
            ? expiryDate.toLocaleDateString("pl-PL", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-"}
        </div>
      </div>
    </>
  );
};
