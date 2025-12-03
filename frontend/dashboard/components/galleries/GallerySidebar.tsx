import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import { useGalleryStore } from "../../store/gallerySlice";
import { useOrderStore } from "../../store/orderSlice";

import { CoverPhotoUpload } from "./sidebar/CoverPhotoUpload";
import { DeleteGalleryButton } from "./sidebar/DeleteGalleryButton";
import { GalleryMetadata } from "./sidebar/GalleryMetadata";
import { GalleryNavigation } from "./sidebar/GalleryNavigation";
import { GalleryUrlSection } from "./sidebar/GalleryUrlSection";
import { OrderActionsSection } from "./sidebar/OrderActionsSection";

export default function GallerySidebar() {
  const router = useRouter();
  const { orderId: orderIdFromQuery } = router.query;
  // Get orderId from query param
  const orderId: string | undefined = Array.isArray(orderIdFromQuery)
    ? orderIdFromQuery[0]
    : orderIdFromQuery;

  // Subscribe directly to store - use selector that includes cache as fallback
  const { id: galleryId } = router.query;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;

  // Use selector that includes cache - ensures gallery is always available if cached
  const gallery = useGalleryStore((state) => {
    const storeGallery = state.currentGallery;
    // If store has gallery and it matches, use it
    if (storeGallery?.galleryId === galleryIdStr) {
      return storeGallery;
    }
    // Otherwise check cache - also subscribe to cache entry to make it reactive
    if (galleryIdStr && typeof galleryIdStr === "string") {
      const cacheEntry = state.galleryCache[galleryIdStr];
      if (cacheEntry) {
        const age = Date.now() - cacheEntry.timestamp;
        if (age < 60000) {
          // Cache TTL: 60 seconds
          const cached = cacheEntry.gallery;
          if (cached?.galleryId === galleryIdStr) {
            return cached;
          }
        }
      }
    }
    return storeGallery;
  });

  const isLoading = useGalleryStore((state) => state.isLoading);
  const order = useOrderStore((state) => state.currentOrder);

  // Gallery now includes cache, so use it directly
  const effectiveGallery = gallery;

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

  // Hide secondary elements when viewport height is below threshold (1100px)
  // This ensures navigation menu remains accessible
  const shouldHideSecondaryElements = viewportHeight < 1100;

  const handleBack = () => {
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
    <aside className="fixed flex flex-col top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 w-[380px]">
      {/* Back Button */}
      <div className="h-[76px] border-b border-gray-200 dark:border-gray-800 flex items-center">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-base font-semibold text-gray-900 hover:text-gray-700 dark:text-white dark:hover:text-gray-300 transition-colors"
        >
          <ChevronLeft size={20} />
          Powrót
        </button>
      </div>

      {/* Gallery Info */}
      {!isLoading && effectiveGallery ? (
        <div className="py-6 border-b border-gray-200 dark:border-gray-800">
          <Link
            href={`/galleries/${effectiveGallery.galleryId}`}
            className="text-lg font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer"
          >
            {effectiveGallery.galleryName ?? "Galeria"}
          </Link>
        </div>
      ) : (
        <div className="py-6 border-b border-gray-200 dark:border-gray-800">
          <div className="text-lg font-semibold text-gray-400 dark:text-gray-600">Ładowanie...</div>
        </div>
      )}

      <CoverPhotoUpload />

      <GalleryUrlSection shouldHideSecondaryElements={shouldHideSecondaryElements} />

      <GalleryMetadata shouldHideSecondaryElements={shouldHideSecondaryElements} />

      <GalleryNavigation />

      {orderId && order && <OrderActionsSection orderId={orderId} />}

      <DeleteGalleryButton
        galleryId={effectiveGallery?.galleryId ?? ""}
        galleryName={effectiveGallery?.galleryName}
      />
    </aside>
  );
}
