import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect, useCallback } from "react";

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

  // Function to manually trigger plan calculation (deferred until needed)
  const calculatePlanRecommendation = useCallback(async () => {
    if (galleryLoading || isPaid || !gallery?.galleryId || isLoadingPlanRecommendation) {
      return;
    }

    setIsLoadingPlanRecommendation(true);
    try {
      const recommendation = await getPlanRecommendation(gallery.galleryId);
      if (!recommendation || (recommendation.uploadedSizeBytes ?? 0) === 0) {
        setPlanRecommendation(null);
        setOptimisticBytesUsed(0);
      } else {
        setPlanRecommendation(recommendation);
        setOptimisticBytesUsed(recommendation.uploadedSizeBytes);
      }
    } catch (error) {
      console.error("Failed to calculate plan recommendation:", error);
      const galleryBytes = (gallery.originalsBytesUsed as number | undefined) ?? 0;
      if (galleryBytes === 0) {
        setPlanRecommendation(null);
        setOptimisticBytesUsed(0);
      }
    } finally {
      setIsLoadingPlanRecommendation(false);
    }
  }, [gallery?.galleryId, gallery?.originalsBytesUsed, galleryLoading, isPaid, isLoadingPlanRecommendation]);

  // Listen for gallery updates (e.g., after uploads/deletions) with optimistic updates only
  // Defer plan calculation until user actually needs it (e.g., opens pricing modal)
  useEffect(() => {
    if (galleryLoading || isPaid || !gallery?.galleryId) {
      return;
    }

    // Use refs to avoid stale closures
    const galleryRef = { current: gallery };
    const planRecommendationRef = { current: planRecommendation };
    
    // Update refs when values change
    galleryRef.current = gallery;
    planRecommendationRef.current = planRecommendation;

    const handleGalleryUpdate = async (event?: Event) => {
      // Check if event has size delta for optimistic update
      const customEvent = event as
        | CustomEvent<{
            galleryId?: string;
            sizeDelta?: number;
            isUpload?: boolean;
            refreshAfterUpload?: boolean;
          }>
        | undefined;
      const sizeDelta = customEvent?.detail?.sizeDelta;
      const refreshAfterUpload = customEvent?.detail?.refreshAfterUpload ?? false;
      const eventGalleryId = customEvent?.detail?.galleryId;
      
      // Only handle events for this gallery (if galleryId is specified in event)
      if (eventGalleryId && eventGalleryId !== galleryRef.current?.galleryId) {
        return;
      }

      // Optimistic update: immediately adjust bytes if size delta is provided
      if (sizeDelta !== undefined) {
        setOptimisticBytesUsed((prev) => {
          const currentBytes =
            prev ??
            planRecommendationRef.current?.uploadedSizeBytes ??
            (galleryRef.current?.originalsBytesUsed as number | undefined) ??
            0;
          const newOptimisticBytes = Math.max(0, currentBytes + sizeDelta);

          // Update plan recommendation optimistically (if we have one)
          if (newOptimisticBytes === 0) {
            setPlanRecommendation(null);
          } else if (planRecommendationRef.current) {
            // Update the recommendation with new size
            setPlanRecommendation({
              ...planRecommendationRef.current,
              uploadedSizeBytes: newOptimisticBytes,
            });
          }

          return newOptimisticBytes;
        });
      }

      // Skip plan calculation if this is a refresh after upload completion
      // Plan calculation will happen when user opens pricing modal or when component becomes visible
      if (refreshAfterUpload) {
        return;
      }

      // For deletions, clear plan recommendation if gallery is empty
      // But don't recalculate - let it be calculated lazily when needed
      if (sizeDelta !== undefined && sizeDelta < 0) {
        const currentBytes = 
          optimisticBytesUsed ??
          planRecommendationRef.current?.uploadedSizeBytes ??
          (galleryRef.current?.originalsBytesUsed as number | undefined) ??
          0;
        if (currentBytes + sizeDelta <= 0) {
          setPlanRecommendation(null);
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("galleryUpdated", handleGalleryUpdate);
      return () => {
        window.removeEventListener("galleryUpdated", handleGalleryUpdate);
      };
    }
    return undefined;
  }, [gallery?.galleryId, gallery?.originalsBytesUsed, galleryLoading, isPaid, planRecommendation, optimisticBytesUsed]);

  // Calculate plan on initial mount if gallery has photos and is not paid
  // This ensures plan is available when sidebar components render
  useEffect(() => {
    if (galleryLoading || isPaid || !gallery?.galleryId) {
      return;
    }

    const hasPhotos = (gallery.originalsBytesUsed as number | undefined) ?? 0 > 0;
    // Only calculate if we have photos and don't have a recommendation yet
    if (hasPhotos && !planRecommendation && !isLoadingPlanRecommendation) {
      void calculatePlanRecommendation();
    }
  }, [gallery?.galleryId, gallery?.originalsBytesUsed, galleryLoading, isPaid, planRecommendation, isLoadingPlanRecommendation, calculatePlanRecommendation]);

  // Listen for publish wizard open event to calculate plan when user needs it
  useEffect(() => {
    const handleOpenPublishWizard = (event: CustomEvent) => {
      if (event.detail?.galleryId === gallery?.galleryId && !isPaid) {
        // Calculate plan when user opens pricing modal
        void calculatePlanRecommendation();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("openPublishWizard", handleOpenPublishWizard as EventListener);
      return () => {
        window.removeEventListener("openPublishWizard", handleOpenPublishWizard as EventListener);
      };
    }
    return undefined;
  }, [gallery?.galleryId, isPaid, calculatePlanRecommendation]);

  // Clear plan recommendation if gallery becomes empty (e.g., all photos deleted)
  useEffect(() => {
    if (galleryLoading || isPaid || !gallery?.galleryId) {
      return;
    }

    const currentBytes = gallery.originalsBytesUsed as number | undefined;
    if (currentBytes === 0 || currentBytes === undefined) {
      setPlanRecommendation(null);
      setOptimisticBytesUsed(0);
    }
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
