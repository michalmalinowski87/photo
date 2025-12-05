import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

import { useGalleryData } from "../../hooks/useGalleryData";
import { useModal } from "../../hooks/useModal";
import { storeLogger } from "../../lib/store-logger";
import { useGalleryStore, useOrderStore } from "../../store";
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
  const { id: galleryId, orderId } = router.query;

  // Zustand stores - subscribe to all needed state
  // Get galleryId from router - handle both string and array cases
  const galleryIdFromQuery = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdStr = typeof galleryIdFromQuery === "string" ? galleryIdFromQuery : undefined;

  // Use individual selectors - Zustand will only re-render when these specific values change
  // Memoize children to prevent remounting on parent re-renders
  const gallery = useGalleryStore((state) => {
    if (!galleryIdStr) {
      return state.currentGallery;
    }
    return state.currentGallery?.galleryId === galleryIdStr ? state.currentGallery : null;
  });
  const loading = useGalleryStore((state) => state.isLoading);
  const loadError = useGalleryStore((state) => state.error);
  const galleryCreationLoading = useGalleryStore((state) => state.galleryCreationLoading);

  // Get actions using getState() to avoid subscriptions - these are stable and won't cause re-renders
  const clearCurrentGallery = useGalleryStore.getState().clearCurrentGallery;
  const reloadGallery = useGalleryStore.getState().reloadGallery;

  // Order store - subscribe directly to values we need (not combined object to avoid shallow equality issues)
  const currentOrder = useOrderStore((state) => state.currentOrder);
  const orderLoading = useOrderStore((state) => state.isLoading);

  // Get actions using getState() to avoid subscriptions
  const clearCurrentOrder = useOrderStore.getState().clearCurrentOrder;
  const fetchOrder = useOrderStore.getState().fetchOrder;
  const denyLoading = useOrderStore.getState().denyLoading;
  const denyChangeRequest = useOrderStore.getState().denyChangeRequest;

  // Memoize children to prevent remounting when parent re-renders
  const memoizedChildren = useMemo(() => children, [children]);

  // Modal hooks
  const { isOpen: denyModalOpen, closeModal: closeDenyModal } = useModal("deny-change");
  // Use local state for publish wizard (UI state, not global state)
  const [publishWizardOpen, setPublishWizardOpen] = useState(false);
  const [showClientSendPopup, setShowClientSendPopup] = useState(false);

  // Use custom hooks for gallery data - simplified, no local state setters
  const { loadGalleryData } = useGalleryData({
    galleryId,
  });

  // GalleryLayoutWrapper only loads gallery data - page components load their own data (orders, images)

  // Helper function to clean up publish wizard URL params
  const cleanupPublishParams = useCallback(() => {
    if (typeof window === "undefined" || !router.isReady) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hadPublishParam = params.has("publish");
    const hadGalleryIdParam = params.has("galleryId");

    if (hadPublishParam || hadGalleryIdParam) {
      // Remove publish wizard params, but keep other params (like payment=success)
      params.delete("publish");
      params.delete("galleryId");
      params.delete("duration");
      params.delete("planKey");

      const newParamsStr = params.toString();
      const newPath = router.asPath.split("?")[0]; // Get path without query string
      const newUrl = newParamsStr ? `${newPath}?${newParamsStr}` : newPath;

      // Use router.replace() to update Next.js router state properly
      void router.replace(newUrl, undefined, { shallow: true });
    }
  }, [router]);

  // SIMPLIFIED RULE: Only clear gallery/order when navigating AWAY from gallery routes
  // Examples of when to clear: /dashboard, /wallet, /settings (global), /clients
  // Examples of when NOT to clear:
  //   - /galleries/[id] -> /galleries/[id]/photos
  //   - /galleries/[id]/orders/[orderId] -> /galleries/[id]/orders/[orderId]/settings
  //   - /galleries/[id]/photos -> /galleries/[id]/settings
  // State updates (paid, status changes) should merge/update, not clear and reload

  // Track loaded galleryId to prevent unnecessary fetches (declare before use)
  const loadedGalleryIdRef = useRef<string | null>(null);
  const initialMountHandledRef = useRef(false);

  // Handle initial mount: clear state if we're not on a gallery route (only once)
  // This is the ONLY reactive cleanup we keep - for initial page load edge cases
  // All other cleanup happens explicitly when users click navigation links
  useEffect(() => {
    if (router.isReady && !initialMountHandledRef.current) {
      initialMountHandledRef.current = true;
      if (!router.asPath.includes("/galleries/")) {
        clearCurrentGallery();
        clearCurrentOrder();
        loadedGalleryIdRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.asPath]);

  // Auth initialization is handled in the loadGalleryData effect below

  // Track loaded galleryId to prevent unnecessary fetches
  // Do NOT clear gallery when galleryId changes - only fetch if needed
  // Gallery will be cleared explicitly when users navigate away (via navigation utility)
  useEffect(() => {
    const currentGalleryId = galleryId as string;
    if (!currentGalleryId) {
      // Reset refs when galleryId is cleared (but don't clear gallery - navigation utility handles that)
      loadedGalleryIdRef.current = null;
    }
  }, [galleryId]);

  useEffect(() => {
    const currentGalleryId = galleryId as string;
    if (!router.isReady || !currentGalleryId) {
      return;
    }

    // Don't fetch if we're not on a gallery route
    if (!router.pathname.includes("/galleries/") && !router.asPath.includes("/galleries/")) {
      return;
    }

    // Auth is handled by AuthProvider - just load data when ready
    // Check store directly before fetching to avoid unnecessary calls
    const storeGallery = useGalleryStore.getState().currentGallery;
    const hasGalleryInStore = storeGallery?.galleryId === currentGalleryId;

    // Only fetch if we don't have the gallery in store and haven't loaded it yet
    if (!hasGalleryInStore && loadedGalleryIdRef.current !== currentGalleryId) {
      loadedGalleryIdRef.current = currentGalleryId;
      void loadGalleryData();
    }
    // Only depend on galleryId and router.isReady - NOT on pathname/asPath to prevent re-fetches on route changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, galleryId]);

  // Order action handlers - these are handled by child components (OrderActionsSection, etc.)
  // Keeping only the deny handler that's used by DenyChangeRequestModal
  const handleDenyConfirm = useCallback(
    async (reason?: string) => {
      if (!galleryId || !orderId) {
        storeLogger.logSkippedOperation(
          "GalleryLayoutWrapper",
          "handleDenyConfirm",
          "Missing galleryId or orderId",
          { galleryId, orderId }
        );
        return;
      }
      await denyChangeRequest(galleryId as string, orderId as string, reason);
      closeDenyModal();
      // Store action already reloads order, page components will react to store changes
    },
    [galleryId, orderId, denyChangeRequest, closeDenyModal]
  );

  // Check URL params to auto-open wizard (but skip if gallery is already published)
  // This effect should trigger when URL params change (e.g., returning from top-up)
  useEffect(() => {
    if (typeof window === "undefined" || !galleryId || !router.isReady) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const publishParam = params.get("publish");
    const galleryParam = params.get("galleryId");

    if (publishParam === "true" && galleryParam === galleryId) {
      // If gallery is not loaded yet, wait for it (don't open wizard yet)
      if (!gallery) {
        return;
      }

      // Check if gallery is already published
      const isAlreadyPublished =
        gallery.state === "PAID_ACTIVE" || gallery.paymentStatus === "PAID";

      if (isAlreadyPublished) {
        // Gallery is already published - clean up URL params but don't open wizard
        cleanupPublishParams();
      } else {
        // Gallery is not published yet - open the wizard
        setPublishWizardOpen(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, router.isReady, router.asPath, gallery, cleanupPublishParams]);

  // Clean up URL params when wizard closes (so NextStepsOverlay can show)
  useEffect(() => {
    if (typeof window !== "undefined" && router.isReady && galleryId) {
      // Only clean up if wizard is closed and we have publish params in URL
      const params = new URLSearchParams(window.location.search);
      if (!publishWizardOpen && params.get("publish") === "true") {
        cleanupPublishParams();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishWizardOpen, router.isReady, router.asPath, galleryId, cleanupPublishParams]);

  // Payment confirmation is handled by page components (e.g., [orderId].tsx)
  // GalleryLayoutWrapper only handles gallery data loading

  // Removed unused handlers - they're handled by child components (GalleryUrlSection, etc.)

  // Memoize computed values to prevent unnecessary recalculations
  const orderIdFromQuery = useMemo(
    () => (Array.isArray(orderId) ? orderId[0] : orderId),
    [orderId]
  );
  const orderIdStr = useMemo(
    () => (typeof orderIdFromQuery === "string" ? orderIdFromQuery : undefined),
    [orderIdFromQuery]
  );
  const isOrderPage = useMemo(() => !!orderIdStr, [orderIdStr]);

  // SIMPLIFIED: Just use currentOrder?.orderId and currentGallery?.galleryId directly - no derived variables
  const hasGallery = !!gallery && gallery.galleryId === galleryIdStr;
  const hasOrder = isOrderPage && orderIdStr && currentOrder?.orderId === orderIdStr;

  // Only show loading if we don't have the data and it's actually loading
  const shouldShowOrderLoading = isOrderPage && !hasOrder && orderLoading;
  const shouldShowGalleryLoading = !hasGallery && loading;

  // Never show loading if we have the order (order page handles its own loading)
  const shouldShowLoading =
    router.isReady &&
    !hasOrder && // Critical: if we have order, never show loading
    (shouldShowGalleryLoading || shouldShowOrderLoading) &&
    !galleryCreationLoading;

  // Debug logging
  if (isOrderPage && typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[GalleryLayoutWrapper] Loading state:", {
      isOrderPage,
      orderIdStr,
      currentOrderOrderId: currentOrder?.orderId,
      hasOrder,
      orderLoading,
      shouldShowOrderLoading,
      shouldShowGalleryLoading,
      shouldShowLoading,
      routerIsReady: router.isReady,
      galleryCreationLoading,
      loading,
      hasGallery,
      galleryIdStr,
    });
  }

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
          <div>{loadError}</div>
        </div>
      </GalleryLayout>
    );
  }

  return (
    <>
      <WelcomePopupWrapper />
      <GalleryLayout setPublishWizardOpen={setPublishWizardOpen}>
        {publishWizardOpen ? (
          <PublishGalleryWizard
            isOpen={publishWizardOpen}
            onClose={() => {
              setPublishWizardOpen(false);
              // Clean up URL params when wizard closes so NextStepsOverlay can show
              cleanupPublishParams();
            }}
            galleryId={galleryIdStr ?? ""}
            onSuccess={async () => {
              // Reload gallery data to update payment status
              if (galleryIdStr) {
                await reloadGallery(galleryIdStr);
              }
              // If we're on an order page, reload order data
              // Store updates will trigger re-renders automatically via Zustand subscriptions
              if (orderIdStr && galleryIdStr) {
                await fetchOrder(galleryIdStr, orderIdStr);
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
        galleryName={gallery?.galleryName}
      />
    </>
  );
}
