import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import { useGallery } from "../../hooks/queries/useGalleries";
import { useOrder } from "../../hooks/queries/useOrders";
import { useNavigation } from "../../hooks/useNavigation";
import { useUnifiedStore } from "../../store/unifiedStore";

import { CoverPhotoUpload } from "./sidebar/CoverPhotoUpload";
import { DeleteGalleryButton } from "./sidebar/DeleteGalleryButton";
import { EditableGalleryName } from "./sidebar/EditableGalleryName";
import { GalleryMetadata } from "./sidebar/GalleryMetadata";
import { GalleryNavigation } from "./sidebar/GalleryNavigation";
import { GalleryUrlSection } from "./sidebar/GalleryUrlSection";
import { OrderActionsSection } from "./sidebar/OrderActionsSection";
import { OwnerClientPreviewButton } from "./sidebar/OwnerClientPreviewButton";

export default function GallerySidebar() {
  const router = useRouter();
  const { navigate } = useNavigation();
  const { orderId: orderIdFromQuery } = router.query;
  // Get orderId from query param
  const orderId: string | undefined = Array.isArray(orderIdFromQuery)
    ? orderIdFromQuery[0]
    : orderIdFromQuery;

  // Get galleryId from router
  const { id: galleryId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  // Use React Query hooks for data
  const { data: gallery, isLoading: galleryLoading } = useGallery(galleryIdForQuery);
  const { data: order } = useOrder(galleryIdForQuery, orderId);

  // Use gallery from React Query
  const effectiveGallery = gallery;

  const handleGalleryNameClick = () => {
    if (effectiveGallery?.galleryId) {
      void navigate(`/galleries/${effectiveGallery.galleryId}`);
    }
  };

  // Show loading if React Query is loading
  const shouldShowLoading = galleryLoading && !gallery;

  const prevStateRef = React.useRef({ hasGallery: !!gallery });
  if (prevStateRef.current.hasGallery !== !!gallery) {
    prevStateRef.current = { hasGallery: !!gallery };
  }

  const [viewportHeight, setViewportHeight] = useState<number>(
    typeof window !== "undefined" ? window.innerHeight : 1024
  );

  // Track viewport height to conditionally hide elements when screen is too short
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };

    // Set initial height
    setViewportHeight(window.innerHeight);

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Hide secondary elements when viewport height is below threshold (800px)
  // This ensures navigation menu remains accessible
  const shouldHideSecondaryElements = viewportHeight < 800;

  const setGalleryCreationFlowActive = useUnifiedStore(
    (state) => state.setGalleryCreationFlowActive
  );

  const handleBack = () => {
    // Clear gallery creation flow state when navigating back
    setGalleryCreationFlowActive(false);

    if (typeof window !== "undefined" && gallery?.galleryId) {
      const referrerKey = `gallery_referrer_${gallery.galleryId}`;
      const referrerPath = sessionStorage.getItem(referrerKey);

      if (referrerPath) {
        void router.push(referrerPath);
      } else {
        void router.push("/");
      }
    } else {
      void router.push("/");
    }
  };

  return (
    <aside className="fixed flex flex-col top-0 px-7 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-400 w-[371px]">
      {/* Back Button */}
      <div className="h-[54px] border-b border-gray-400 dark:border-gray-800 flex items-center">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-gray-700 dark:text-white dark:hover:text-gray-300 transition-colors"
        >
          <ChevronLeft size={20} />
          Powrót
        </button>
      </div>

      {/* Gallery Info */}
      {!shouldShowLoading && effectiveGallery ? (
        <div className="py-4 border-b border-gray-400 dark:border-gray-800">
          <EditableGalleryName
            galleryId={effectiveGallery.galleryId}
            galleryName={
              typeof effectiveGallery.galleryName === "string"
                ? effectiveGallery.galleryName
                : "Galeria"
            }
            onNameClick={handleGalleryNameClick}
          />
        </div>
      ) : shouldShowLoading ? (
        <div className="py-4 border-b border-gray-400 dark:border-gray-800">
          <div className="text-lg font-semibold text-gray-400 dark:text-gray-600">Ładowanie...</div>
        </div>
      ) : null}

      <CoverPhotoUpload />

      <GalleryUrlSection shouldHideSecondaryElements={shouldHideSecondaryElements} />

      <GalleryMetadata shouldHideSecondaryElements={shouldHideSecondaryElements} />

      <GalleryNavigation />

      {orderId && order && <OrderActionsSection orderId={orderId} />}

      <OwnerClientPreviewButton gallery={effectiveGallery} />

      <DeleteGalleryButton
        galleryId={effectiveGallery?.galleryId ?? ""}
        galleryName={
          effectiveGallery?.galleryName && typeof effectiveGallery.galleryName === "string"
            ? effectiveGallery.galleryName
            : undefined
        }
      />
    </aside>
  );
}
