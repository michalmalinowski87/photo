import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";

import { getPlanRecommendation } from "../../lib/calculate-plan";
import type { PlanRecommendation } from "../../lib/plan-types";

import { CoverPhotoUpload } from "./sidebar/CoverPhotoUpload";
import { DeleteGalleryButton } from "./sidebar/DeleteGalleryButton";
import { GalleryMetadata } from "./sidebar/GalleryMetadata";
import { GalleryNavigation } from "./sidebar/GalleryNavigation";
import { GalleryUrlSection } from "./sidebar/GalleryUrlSection";
import { OrderActionsSection } from "./sidebar/OrderActionsSection";
import { StorageUsageInfo } from "./sidebar/StorageUsageInfo";
import { UnpublishedBanner } from "./sidebar/UnpublishedBanner";

interface Gallery {
  galleryId: string;
  galleryName?: string;
  name?: string;
  coverPhotoUrl?: string;
  [key: string]: unknown;
}

interface Order {
  orderId: string;
  galleryId: string;
  [key: string]: unknown;
}

interface GallerySidebarProps {
  gallery: Gallery;
  isPaid: boolean;
  galleryUrl: string;
  onPay: () => void;
  onCopyUrl: () => void;
  onSendLink: () => void;
  onSettings: () => void;
  onReloadGallery?: () => Promise<void>;
  order?: Order;
  orderId?: string;
  sendLinkLoading?: boolean;
  onDownloadZip?: () => void;
  canDownloadZip?: boolean;
  onMarkOrderPaid?: () => void;
  onDownloadFinals?: () => void;
  onSendFinalsToClient?: () => void;
  onApproveChangeRequest?: () => void;
  onDenyChangeRequest?: () => void;
  hasFinals?: boolean;
  hasDeliveredOrders?: boolean | undefined;
  galleryLoading?: boolean;
}

export default function GallerySidebar({
  gallery,
  isPaid,
  galleryUrl,
  onPay,
  onCopyUrl,
  onSendLink,
  onSettings: _onSettings,
  onReloadGallery,
  order,
  orderId,
  sendLinkLoading = false,
  onDownloadZip,
  canDownloadZip,
  onMarkOrderPaid,
  onDownloadFinals,
  onSendFinalsToClient,
  onApproveChangeRequest,
  onDenyChangeRequest,
  hasFinals,
  hasDeliveredOrders,
  galleryLoading,
}: GallerySidebarProps) {
  const router = useRouter();
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(gallery?.coverPhotoUrl ?? null);
  const [planRecommendation, setPlanRecommendation] = useState<PlanRecommendation | null>(null);
  const [isLoadingPlanRecommendation, setIsLoadingPlanRecommendation] = useState(false);
  const [optimisticBytesUsed, setOptimisticBytesUsed] = useState<number | null>(null);
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

  // Update cover photo URL when gallery prop changes (backend already converts to CloudFront)
  useEffect(() => {
    const newUrl = gallery?.coverPhotoUrl ?? null;
    // Only update if URL actually changed to avoid unnecessary re-renders
    if (newUrl !== coverPhotoUrl) {
      setCoverPhotoUrl(newUrl);
    }
  }, [gallery?.coverPhotoUrl, coverPhotoUrl]);

  // Load plan recommendation when gallery is unpaid - refresh more aggressively
  // Also refresh when gallery.originalsBytesUsed changes to ensure we have the latest data
  useEffect(() => {
    if (galleryLoading || isPaid || !gallery?.galleryId) {
      // Clear recommendation when gallery is paid or loading to prevent flicker
      setPlanRecommendation(null);
      setOptimisticBytesUsed(null);
      setIsLoadingPlanRecommendation(false);
      return;
    }

    // Reset optimistic counter when gallery changes
    setOptimisticBytesUsed(null);
    // Clear recommendation immediately to prevent showing stale data
    setPlanRecommendation(null);

    // Always try to load plan recommendation to get fresh size data
    // This ensures we have the latest uploaded size even if gallery prop hasn't updated yet
    setIsLoadingPlanRecommendation(true);
    getPlanRecommendation(gallery.galleryId)
      .then((recommendation) => {
        // If no photos are uploaded, clear the plan recommendation
        if (!recommendation || (recommendation.uploadedSizeBytes ?? 0) === 0) {
          setPlanRecommendation(null);
          setOptimisticBytesUsed(0);
        } else {
          setPlanRecommendation(recommendation);
          setOptimisticBytesUsed(recommendation.uploadedSizeBytes);
        }
      })
      .catch((error) => {
        console.error("Failed to load plan recommendation:", error);
        setPlanRecommendation(null);
        setOptimisticBytesUsed(null);
      })
      .finally(() => {
        setIsLoadingPlanRecommendation(false);
      });
  }, [gallery?.galleryId, gallery?.originalsBytesUsed, galleryLoading, isPaid]);

  // Listen for gallery updates (e.g., after uploads/deletions) with optimistic updates
  useEffect(() => {
    if (galleryLoading || isPaid || !gallery?.galleryId) {
      return;
    }

    let requestCounter = 0;

    const handleGalleryUpdate = async (event?: Event) => {
      // Check if event has size delta for optimistic update
      const customEvent = event as
        | CustomEvent<{ galleryId?: string; sizeDelta?: number }>
        | undefined;
      const sizeDelta = customEvent?.detail?.sizeDelta;

      // Optimistic update: immediately adjust bytes if size delta is provided
      if (sizeDelta !== undefined) {
        setOptimisticBytesUsed((prev) => {
          const currentBytes =
            prev ??
            planRecommendation?.uploadedSizeBytes ??
            (gallery.originalsBytesUsed as number | undefined) ??
            0;
          const newOptimisticBytes = Math.max(0, currentBytes + sizeDelta);

          // Update plan recommendation optimistically
          if (newOptimisticBytes === 0) {
            setPlanRecommendation(null);
          } else if (planRecommendation) {
            // Update the recommendation with new size
            setPlanRecommendation({
              ...planRecommendation,
              uploadedSizeBytes: newOptimisticBytes,
            });
          }

          return newOptimisticBytes;
        });
      }

      // Increment counter to track the latest request
      requestCounter += 1;
      const currentRequest = requestCounter;

      // Refresh plan recommendation from API in background (for accuracy)
      setIsLoadingPlanRecommendation(true);
      try {
        const recommendation = await getPlanRecommendation(gallery.galleryId);

        // Only update if this is still the latest request (prevent stale data from race conditions)
        if (currentRequest === requestCounter) {
          // If no photos are uploaded, clear the plan recommendation
          if (!recommendation || (recommendation.uploadedSizeBytes ?? 0) === 0) {
            setPlanRecommendation(null);
            setOptimisticBytesUsed(0);
          } else {
            setPlanRecommendation(recommendation);
            setOptimisticBytesUsed(recommendation.uploadedSizeBytes);
          }
        }
      } catch (error) {
        // Only update on error if this is still the latest request
        if (currentRequest === requestCounter) {
          console.error("Failed to refresh plan recommendation:", error);
          // On error, clear recommendation if gallery shows no photos
          if ((gallery.originalsBytesUsed as number | undefined) ?? 0 === 0) {
            setPlanRecommendation(null);
            setOptimisticBytesUsed(0);
          }
        }
      } finally {
        // Only update loading state if this is still the latest request
        if (currentRequest === requestCounter) {
          setIsLoadingPlanRecommendation(false);
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("galleryUpdated", handleGalleryUpdate);
      return () => {
        window.removeEventListener("galleryUpdated", handleGalleryUpdate);
        // Invalidate any pending requests
        requestCounter += 1;
      };
    }
    return undefined;
  }, [gallery?.galleryId, gallery?.originalsBytesUsed, galleryLoading, isPaid, planRecommendation]);

  // Also refresh when gallery.originalsBytesUsed changes (in case event didn't fire or was missed)
  // This ensures we update even if the event wasn't dispatched
  useEffect(() => {
    if (galleryLoading || isPaid || !gallery?.galleryId) {
      return;
    }

    // If gallery shows 0 bytes, immediately clear recommendation (optimistic update)
    const currentBytes = gallery.originalsBytesUsed as number | undefined;
    if (currentBytes === 0 || currentBytes === undefined) {
      setPlanRecommendation(null);
      setIsLoadingPlanRecommendation(false);
      return;
    }

    // Debounce to avoid too many API calls, but use shorter delay for better UX
    let isCancelled = false;

    const timeoutId = setTimeout(() => {
      if (isCancelled) {
        return;
      }

      setIsLoadingPlanRecommendation(true);

      getPlanRecommendation(gallery.galleryId)
        .then((recommendation) => {
          // Only update if this effect hasn't been cancelled and we're still on the same gallery
          if (isCancelled) {
            return;
          }

          // If no photos are uploaded, clear the plan recommendation
          if (!recommendation || (recommendation.uploadedSizeBytes ?? 0) === 0) {
            setPlanRecommendation(null);
          } else {
            setPlanRecommendation(recommendation);
          }
        })
        .catch((error) => {
          if (isCancelled) {
            return;
          }
          console.error("Failed to refresh plan recommendation:", error);
          // On error, clear recommendation if gallery shows no photos
          if ((gallery.originalsBytesUsed as number | undefined) ?? 0 === 0) {
            setPlanRecommendation(null);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoadingPlanRecommendation(false);
          }
        });
    }, 200); // Reduced from 500ms to 200ms for faster updates

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [gallery?.galleryId, gallery?.originalsBytesUsed, galleryLoading, isPaid]);

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
      {!galleryLoading && gallery ? (
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

      <CoverPhotoUpload
        gallery={gallery}
        galleryLoading={galleryLoading ?? false}
        coverPhotoUrl={coverPhotoUrl}
        onCoverPhotoChange={setCoverPhotoUrl}
        onReloadGallery={onReloadGallery}
      />

      <GalleryUrlSection
        galleryUrl={galleryUrl}
        gallery={gallery}
        galleryLoading={galleryLoading ?? false}
        isPaid={isPaid}
        order={order}
        sendLinkLoading={sendLinkLoading}
        shouldHideSecondaryElements={shouldHideSecondaryElements}
        onCopyUrl={onCopyUrl}
        onSendLink={onSendLink}
      />

      <GalleryMetadata
        gallery={gallery}
        isPaid={isPaid}
        shouldHideSecondaryElements={shouldHideSecondaryElements}
        galleryLoading={galleryLoading ?? false}
      />

      <GalleryNavigation
        gallery={gallery}
        galleryLoading={galleryLoading ?? false}
        hasDeliveredOrders={hasDeliveredOrders}
      />

      {orderId && order && (
        <OrderActionsSection
          orderId={orderId}
          order={order}
          gallery={gallery}
          galleryLoading={galleryLoading ?? false}
          isPaid={isPaid}
          canDownloadZip={canDownloadZip}
          hasFinals={hasFinals}
          onDownloadZip={onDownloadZip}
          onDownloadFinals={onDownloadFinals}
          onApproveChangeRequest={onApproveChangeRequest}
          onDenyChangeRequest={onDenyChangeRequest}
          onMarkOrderPaid={onMarkOrderPaid}
          onSendFinalsToClient={onSendFinalsToClient}
        />
      )}

      <StorageUsageInfo
        gallery={gallery}
        galleryLoading={galleryLoading ?? false}
        orderId={orderId}
        isPaid={isPaid}
        optimisticBytesUsed={optimisticBytesUsed}
        planRecommendation={planRecommendation}
        isLoadingPlanRecommendation={isLoadingPlanRecommendation}
      />

      <UnpublishedBanner
        gallery={gallery}
        galleryLoading={galleryLoading ?? false}
        isPaid={isPaid}
        shouldHideSecondaryElements={shouldHideSecondaryElements}
        optimisticBytesUsed={optimisticBytesUsed}
        planRecommendation={planRecommendation}
        isLoadingPlanRecommendation={isLoadingPlanRecommendation}
        onPay={onPay}
      />

      <DeleteGalleryButton
        galleryId={gallery?.galleryId ?? ""}
        galleryName={gallery?.galleryName}
      />
    </aside>
  );
}
