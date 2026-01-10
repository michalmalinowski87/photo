import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback, useMemo } from "react";

import { useDenyChangeRequest } from "../../hooks/mutations/useOrderMutations";
import { useGallery } from "../../hooks/queries/useGalleries";
import { useOrder } from "../../hooks/queries/useOrders";
import { useGalleryCreationLoading } from "../../hooks/useGalleryCreationLoading";
import { useGalleryRoute } from "../../hooks/useGalleryRoute";
import { useModal } from "../../hooks/useModal";
import { usePublishFlow } from "../../hooks/usePublishFlow";
import { ClientSendSuccessPopup } from "../galleries/ClientSendSuccessPopup";
import { PublishGalleryWizard } from "../galleries/PublishGalleryWizard";
import { DenyChangeRequestModal } from "../orders/DenyChangeRequestModal";
import { FullPageLoading } from "../ui/loading/Loading";
import { WelcomePopupWrapper } from "../welcome/WelcomePopupWrapper";

import GalleryLayout from "./GalleryLayout";

interface GalleryLayoutWrapperProps {
  children: React.ReactNode;
}

export default function GalleryLayoutWrapper({ children }: GalleryLayoutWrapperProps) {
  const router = useRouter();
  const galleryRoute = useGalleryRoute();

  // Use galleryId from the route hook (already extracted and validated)
  const galleryIdStr = galleryRoute.galleryId;

  // Use React Query hooks for data fetching
  const {
    data: gallery,
    isLoading: loading,
    error: loadError,
    refetch: refetchGallery,
  } = useGallery(galleryIdStr);

  // Get gallery creation loading from React Query mutations
  const galleryCreationLoading = useGalleryCreationLoading();

  // Use orderId from the route hook (already extracted and validated)
  const orderIdStr = galleryRoute.orderId;

  const { data: currentOrder, isLoading: orderLoading } = useOrder(galleryIdStr, orderIdStr);

  // Deny change request mutation
  const denyChangeRequestMutation = useDenyChangeRequest();
  const denyLoading = denyChangeRequestMutation.isPending;

  // Memoize children to prevent remounting when parent re-renders
  const memoizedChildren = useMemo(() => children, [children]);

  // Modal hooks
  const { isOpen: denyModalOpen, closeModal: closeDenyModal } = useModal("deny-change");
  const [showClientSendPopup, setShowClientSendPopup] = useState(false);

  // Use centralized publish flow hook
  const {
    isOpen: publishWizardOpen,
    galleryId: publishFlowGalleryId,
    initialState,
    closePublishFlow,
  } = usePublishFlow();

  // Check if gallery is already published before opening wizard
  useEffect(() => {
    if (publishWizardOpen && publishFlowGalleryId && gallery) {
      const isAlreadyPublished =
        gallery.state === "PAID_ACTIVE" || gallery.paymentStatus === "PAID";

      if (isAlreadyPublished) {
        // Gallery is already published - close the wizard
        closePublishFlow();
      }
    }
  }, [publishWizardOpen, publishFlowGalleryId, gallery, closePublishFlow]);

  // Close publish flow if gallery doesn't exist or doesn't match (e.g., gallery was deleted)
  useEffect(() => {
    if (publishWizardOpen && publishFlowGalleryId) {
      // If we're on a gallery page but the gallery ID doesn't match, close the flow
      if (galleryIdStr && publishFlowGalleryId !== galleryIdStr) {
        closePublishFlow();
        return;
      }

      // If we have a load error for the gallery we're trying to publish, close the flow
      if (loadError && galleryIdStr === publishFlowGalleryId) {
        closePublishFlow();
        return;
      }

      // If gallery failed to load and we're not loading anymore, close the flow
      if (!loading && !gallery && galleryIdStr === publishFlowGalleryId) {
        closePublishFlow();
      }
    }
  }, [
    publishWizardOpen,
    publishFlowGalleryId,
    galleryIdStr,
    gallery,
    loadError,
    loading,
    closePublishFlow,
  ]);

  // SIMPLIFIED RULE: Only clear gallery/order when navigating AWAY from gallery routes
  // Examples of when to clear: /dashboard, /wallet, /settings (global), /clients
  // Examples of when NOT to clear:
  //   - /galleries/[id] -> /galleries/[id]/photos
  //   - /galleries/[id]/orders/[orderId] -> /galleries/[id]/orders/[orderId]/settings
  //   - /galleries/[id]/photos -> /galleries/[id]/settings
  // State updates (paid, status changes) should merge/update, not clear and reload

  // React Query handles data fetching automatically - no manual loading needed

  // Order action handlers - these are handled by child components (OrderActionsSection, etc.)
  // Keeping only the deny handler that's used by DenyChangeRequestModal
  const handleDenyConfirm = useCallback(
    async (reason?: string, preventFutureChangeRequests?: boolean) => {
      if (!galleryIdStr || !orderIdStr) {
        return;
      }
      try {
        await denyChangeRequestMutation.mutateAsync({
          galleryId: galleryIdStr,
          orderId: orderIdStr,
          reason,
          preventFutureChangeRequests,
        });
        closeDenyModal();
        // React Query will automatically refetch order due to invalidation
      } catch (_err) {
        // Error is handled by mutation
      }
    },
    [galleryIdStr, orderIdStr, denyChangeRequestMutation, closeDenyModal]
  );

  // URL params are now handled by usePublishFlow hook

  // Payment confirmation is handled by page components (e.g., [orderId].tsx)
  // GalleryLayoutWrapper only handles gallery data loading

  // Removed unused handlers - they're handled by child components (GalleryUrlSection, etc.)

  // Use the robust route detection hook instead of manual URL checking
  const isOrderPage = galleryRoute.isOrderPage;

  // SIMPLIFIED: Just use currentOrder?.orderId and currentGallery?.galleryId directly - no derived variables
  const hasGallery = !!gallery && gallery.galleryId === galleryIdStr;
  // Only consider we have an order if we're actually on an order page AND have the order data
  // This prevents stale order data from being used when navigating back to gallery page
  const hasOrder =
    isOrderPage && !!orderIdStr && !!currentOrder && currentOrder.orderId === orderIdStr;

  // Only show loading if we don't have the data and it's actually loading
  const shouldShowOrderLoading = isOrderPage && !hasOrder && orderLoading;
  const shouldShowGalleryLoading = !hasGallery && loading;

  // Never show loading if we have the order (order page handles its own loading)
  const shouldShowLoading =
    router.isReady &&
    !hasOrder && // Critical: if we have order, never show loading
    (shouldShowGalleryLoading || shouldShowOrderLoading) &&
    !galleryCreationLoading;

  // CRITICAL: If we have the order, NEVER show loading overlay
  if (hasOrder) {
    // Order is loaded, render children normally
  } else if (shouldShowLoading) {
    const loadingText =
      isOrderPage && shouldShowOrderLoading ? "Ładowanie zlecenia..." : "Ładowanie galerii...";
    return (
      <GalleryLayout>
        <FullPageLoading text={loadingText} />
      </GalleryLayout>
    );
  }

  // Defensive check: Only show error if we've tried to load and failed (not during initial load)
  if (!gallery && loadError && !loading) {
    return (
      <GalleryLayout>
        <div className="p-4">
          <div>{loadError instanceof Error ? loadError.message : String(loadError)}</div>
        </div>
      </GalleryLayout>
    );
  }

  return (
    <>
      <WelcomePopupWrapper />
      <GalleryLayout>
        {publishWizardOpen && publishFlowGalleryId ? (
          <PublishGalleryWizard
            isOpen={publishWizardOpen}
            onClose={closePublishFlow}
            galleryId={publishFlowGalleryId}
            initialState={initialState}
            onSuccess={async () => {
              // React Query will automatically refetch gallery and order due to invalidation
              if (galleryIdStr) {
                await refetchGallery();
              }
            }}
          />
        ) : (
          memoizedChildren
        )}
      </GalleryLayout>

      <DenyChangeRequestModal
        isOpen={denyModalOpen}
        onClose={closeDenyModal}
        onConfirm={handleDenyConfirm}
        loading={denyLoading}
      />

      {/* Client Send Success Popup */}
      <ClientSendSuccessPopup
        isOpen={showClientSendPopup}
        onClose={() => setShowClientSendPopup(false)}
        galleryName={
          gallery?.galleryName && typeof gallery.galleryName === "string"
            ? gallery.galleryName
            : undefined
        }
      />
    </>
  );
}
