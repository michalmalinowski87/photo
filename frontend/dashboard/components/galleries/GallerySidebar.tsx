import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";

import { useGalleryStore } from "../../store/gallerySlice";
import { useOrderStore } from "../../store/orderSlice";

import { CoverPhotoUpload } from "./sidebar/CoverPhotoUpload";
import { DeleteGalleryButton } from "./sidebar/DeleteGalleryButton";
import { GalleryMetadata } from "./sidebar/GalleryMetadata";
import { GalleryNavigation } from "./sidebar/GalleryNavigation";
import { GalleryUrlSection } from "./sidebar/GalleryUrlSection";
import { OrderActionsSection } from "./sidebar/OrderActionsSection";

interface GallerySidebarProps {
  orderId?: string;
  onDownloadZip?: () => void;
  canDownloadZip?: boolean;
  onMarkOrderPaid?: () => void;
  onDownloadFinals?: () => void;
  onSendFinalsToClient?: () => void;
  onApproveChangeRequest?: () => void;
  onDenyChangeRequest?: () => void;
  hasFinals?: boolean;
}

export default function GallerySidebar({
  orderId: orderIdProp,
  onDownloadZip,
  canDownloadZip,
  onMarkOrderPaid,
  onDownloadFinals,
  onSendFinalsToClient,
  onApproveChangeRequest,
  onDenyChangeRequest,
  hasFinals,
}: GallerySidebarProps) {
  const router = useRouter();
  const { orderId: orderIdFromQuery } = router.query;
  // Use prop if provided, otherwise fall back to query param
  const orderId: string | undefined =
    orderIdProp ?? (Array.isArray(orderIdFromQuery) ? orderIdFromQuery[0] : orderIdFromQuery);

  // Subscribe directly to store - no props needed
  const gallery = useGalleryStore((state) => state.currentGallery);
  const isLoading = useGalleryStore((state) => state.isLoading);
  const order = useOrderStore((state) => state.currentOrder);

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
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Powrót
        </button>
      </div>

      {/* Gallery Info */}
      {!isLoading && gallery ? (
        <div className="py-6 border-b border-gray-200 dark:border-gray-800">
          <Link
            href={`/galleries/${gallery.galleryId}`}
            className="text-lg font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer"
          >
            {gallery.galleryName ?? "Galeria"}
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

      {orderId && order && (
        <OrderActionsSection
          orderId={orderId}
          onDownloadZip={onDownloadZip}
          canDownloadZip={canDownloadZip}
          onMarkOrderPaid={onMarkOrderPaid}
          onDownloadFinals={onDownloadFinals}
          onSendFinalsToClient={onSendFinalsToClient}
          onApproveChangeRequest={onApproveChangeRequest}
          onDenyChangeRequest={onDenyChangeRequest}
          hasFinals={hasFinals}
        />
      )}

      <DeleteGalleryButton
        galleryId={gallery?.galleryId ?? ""}
        galleryName={gallery?.galleryName}
      />
    </aside>
  );
}
