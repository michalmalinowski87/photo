import { useRouter } from "next/router";
import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";

import { useGalleryData } from "../../hooks/useGalleryData";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { useGalleryStore, useOrderStore, useUserStore } from "../../store";
import { ClientSendSuccessPopup } from "../galleries/ClientSendSuccessPopup";
import PaymentConfirmationModal from "../galleries/PaymentConfirmationModal";
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
  const { showToast } = useToast();

  // Zustand stores - subscribe to all needed state
  // Use a selector that includes cache as fallback to ensure gallery is always available if cached
  // Get galleryId from router - handle both string and array cases
  const galleryIdFromQuery = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdStr = typeof galleryIdFromQuery === "string" ? galleryIdFromQuery : undefined;

  // Subscribe to both currentGallery, currentGalleryId, and cache to make selector reactive
  // This ensures we always have the gallery even during navigation when galleryId is temporarily undefined
  const gallery = useGalleryStore((state) => {
    const storeGallery = state.currentGallery;
    const storeGalleryId = state.currentGalleryId;

    // Determine which galleryId to use - prefer URL, fallback to store
    const targetGalleryId = galleryIdStr ?? storeGalleryId;

    if (targetGalleryId) {
      // If store has gallery and it matches target, use it
      if (storeGallery?.galleryId === targetGalleryId) {
        return storeGallery;
      }

      // Otherwise check cache - subscribe to cache entry to make it reactive
      // Accessing state.galleryCache[targetGalleryId] makes this reactive to cache changes
      const cacheEntry = state.galleryCache[targetGalleryId];
      if (cacheEntry) {
        const age = Date.now() - cacheEntry.timestamp;
        if (age < 60000) {
          // Cache TTL: 60 seconds
          const cached = cacheEntry.gallery;
          if (cached?.galleryId === targetGalleryId) {
            return cached;
          }
        }
      }
    }

    // Fallback to store gallery (might be from previous route during navigation)
    return storeGallery;
  });

  const {
    isLoading: loading,
    error: loadError,
    clearCurrentGallery,
    publishWizardOpen,
    publishWizardGalleryId,
    setPublishWizardOpen: setPublishWizardOpenStore,
    sendGalleryLinkToClient,
    sendLinkLoading,
    reloadGallery,
    copyGalleryUrl,
    galleryCreationLoading,
  } = useGalleryStore();

  const {
    currentOrderId,
    clearCurrentOrder,
    fetchOrder,
    denyLoading,
    approveChangeRequest,
    denyChangeRequest,
    markOrderPaid,
    downloadFinals,
    sendFinalsToClient,
    downloadZip: downloadZipAction,
    currentOrder,
  } = useOrderStore();

  const { walletBalanceCents: walletBalance, refreshWalletBalance } = useUserStore();

  // Modal hooks
  const { isOpen: showPaymentModal, closeModal: closePaymentModal } = useModal("payment");
  const {
    isOpen: denyModalOpen,
    openModal: openDenyModal,
    closeModal: closeDenyModal,
  } = useModal("deny-change");

  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentDetails] = useState({
    totalAmountCents: 0,
    walletAmountCents: 0,
    stripeAmountCents: 0,
    balanceAfterPayment: 0,
  });
  // Use Zustand store for publish wizard state instead of local state
  // Check if wizard should be open for this specific gallery
  const isPublishWizardOpenForThisGallery =
    publishWizardOpen && publishWizardGalleryId === galleryId;
  const [showClientSendPopup, setShowClientSendPopup] = useState(false);

  // Use custom hooks for gallery data - simplified, no local state setters
  const { loadGalleryData, loadGalleryOrders, checkDeliveredOrders } = useGalleryData({
    galleryId,
  });

  // GalleryLayoutWrapper does NOT load order data - that's handled by the order page component

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

  // Clear order state when navigating away from order page (but staying in gallery routes)
  // IMPORTANT: Do NOT clear gallery state - it should persist across gallery route navigation
  useEffect(() => {
    // Clear order when orderId is removed from URL but we're still in gallery routes
    if (!orderId && currentOrderId && router.pathname.includes("/galleries/")) {
      clearCurrentOrder();
    }
    // Ensure currentGalleryId and currentGallery are set if we have a galleryId in URL but it's not set in store
    if (galleryId && typeof galleryId === "string") {
      const {
        currentGalleryId: storeGalleryId,
        currentGallery: storeGallery,
        setCurrentGalleryId,
        setCurrentGallery,
        getGalleryFromCache,
      } = useGalleryStore.getState();
      if (storeGalleryId !== galleryId || storeGallery?.galleryId !== galleryId) {
        // Only set if we have cached gallery data, otherwise let the load effect handle it
        const cached = getGalleryFromCache(galleryId, 60000);
        if (cached?.galleryId === galleryId) {
          setCurrentGallery(cached);
          setCurrentGalleryId(galleryId);
        }
      }
    }
  }, [orderId, currentOrderId, router.pathname, clearCurrentOrder, galleryId]);

  // Clear all state when navigating completely away from gallery routes
  useEffect(() => {
    // Check current pathname on mount
    if (router.isReady && !router.asPath.includes("/galleries/")) {
      clearCurrentGallery();
      clearCurrentOrder();
    }

    if (!router.events) {
      return;
    }

    const handleRouteChange = (url: string) => {
      // Close publish wizard when navigating away
      if (publishWizardOpen) {
        setPublishWizardOpenStore(false);
        cleanupPublishParams();
      }
      // ONLY clear gallery when navigating AWAY from gallery routes
      // Do NOT clear when navigating between gallery routes (e.g., photos -> settings)
      if (!url.includes("/galleries/")) {
        clearCurrentGallery();
        clearCurrentOrder();
      }
    };

    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [
    router,
    clearCurrentGallery,
    clearCurrentOrder,
    publishWizardOpen,
    setPublishWizardOpenStore,
    cleanupPublishParams,
  ]);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL ?? "");
    if (router.isReady && galleryId) {
      initializeAuth(
        (token) => {
          setIdToken(token);
        },
        () => {
          redirectToLandingSignIn(router.asPath);
        }
      );
    }
  }, [router.isReady, galleryId, router.asPath]);

  // Track if we've already loaded for this galleryId to prevent duplicate loads
  const loadedGalleryIdRef = React.useRef<string | null>(null);
  // Track previous galleryId to detect navigation between gallery pages vs direct navigation
  const prevGalleryIdForLoadingRef = React.useRef<string | null>(null);
  // Track if this is the initial mount (direct navigation) - reset when galleryId changes
  const isInitialMountRef = React.useRef<boolean>(true);
  const currentGalleryIdForMountRef = React.useRef<string | null>(null);

  useEffect(() => {
    const currentGalleryId = galleryId as string;

    // Reset initial mount flag if galleryId changed (new gallery, treat as direct navigation)
    if (currentGalleryId && currentGalleryId !== currentGalleryIdForMountRef.current) {
      isInitialMountRef.current = true;
      currentGalleryIdForMountRef.current = currentGalleryId;
      prevGalleryIdForLoadingRef.current = null; // Reset previous galleryId for new gallery
    }

    // Skip if we've already loaded this gallery (unless it's a different gallery)
    if (
      loadedGalleryIdRef.current === currentGalleryId &&
      gallery?.galleryId === currentGalleryId
    ) {
      // Mark as no longer initial mount once gallery is loaded
      if (gallery?.galleryId === currentGalleryId) {
        isInitialMountRef.current = false;
      }
      return;
    }

    if (router.isReady && apiUrl && idToken && currentGalleryId) {
      // Check cache first - if we have cached data for this gallery, use it
      const { getGalleryFromCache, setCurrentGallery, setCurrentGalleryId } =
        useGalleryStore.getState();
      const cachedGallery = getGalleryFromCache(currentGalleryId, 60000);

      // Check if this is direct navigation (initial mount) or navigation between gallery pages
      const isDirectNavigation = isInitialMountRef.current;
      const isSameGalleryNavigation = prevGalleryIdForLoadingRef.current === currentGalleryId;

      // If we have cached gallery and it matches, use it immediately
      // But only skip loading if we're navigating between pages of the same gallery
      // For direct navigation, always show loading to ensure proper initialization
      if (cachedGallery?.galleryId === currentGalleryId && isSameGalleryNavigation) {
        setCurrentGallery(cachedGallery);
        setCurrentGalleryId(currentGalleryId);
        loadedGalleryIdRef.current = currentGalleryId; // Mark as loaded
        isInitialMountRef.current = false; // Mark as no longer initial mount
      }

      // Only fetch if gallery doesn't match AND we don't have cache
      // OR if it's direct navigation (always fetch to ensure fresh data)
      if ((gallery?.galleryId !== currentGalleryId && !cachedGallery) || isDirectNavigation) {
        loadedGalleryIdRef.current = currentGalleryId; // Mark as loading
        void loadGalleryData(false, true).then(() => {
          // Mark as loaded after fetch completes
          loadedGalleryIdRef.current = currentGalleryId;
          isInitialMountRef.current = false; // Mark as no longer initial mount once loaded
        }); // Force refresh only if not in cache
      } else if (gallery?.galleryId === currentGalleryId) {
        loadedGalleryIdRef.current = currentGalleryId; // Mark as loaded
        isInitialMountRef.current = false; // Mark as no longer initial mount
      }

      // Refresh wallet balance only when we have a valid token (userSlice handles its own caching)
      if (idToken && idToken.trim() !== "") {
        void refreshWalletBalance();
      }
      void checkDeliveredOrders();
      void loadGalleryOrders(true); // Force refresh

      // Update previous galleryId for next navigation
      prevGalleryIdForLoadingRef.current = currentGalleryId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, apiUrl, idToken, galleryId]); // Removed gallery from deps to prevent loops

  // GalleryLayoutWrapper should NOT load order data - that's the order page's responsibility
  // We only need to know if order is loading for the loading state calculation

  // Auto-detect and fix sync issues: if gallery shows bytes used > 0 but no images exist,
  // automatically trigger forced recalculation to sync database with actual S3 state
  // This runs on ALL gallery pages (photos, orders, settings, etc.)
  const syncRecalcTriggeredRef = React.useRef(false);
  const { fetchGalleryImages } = useGalleryStore();

  useEffect(() => {
    // Reset sync recalculation trigger when gallery changes
    if (galleryId) {
      syncRecalcTriggeredRef.current = false;
    }
  }, [galleryId]);

  useEffect(() => {
    if (!galleryId || loading || !gallery || syncRecalcTriggeredRef.current) {
      return;
    }

    const originalsBytesUsed = gallery?.originalsBytesUsed ?? 0;
    const finalsBytesUsed = gallery?.finalsBytesUsed ?? 0;
    const totalBytesUsed = originalsBytesUsed + finalsBytesUsed;

    // Only check if bytes used > 0 (otherwise no sync issue possible)
    if (totalBytesUsed === 0) {
      return;
    }

    // Check images cache first
    const { getGalleryImages } = useGalleryStore.getState();
    const cachedImages = getGalleryImages(galleryId as string, 60000); // 60s cache
    const hasCachedImages = cachedImages && cachedImages.length > 0;

    if (hasCachedImages) {
      // Images exist in cache - no sync issue
      return;
    }

    // No cached images - fetch fresh to check if images actually exist
    void fetchGalleryImages(galleryId as string, false)
      .then((images) => {
        const hasImages = images && images.length > 0;

        // Trigger recalculation if: bytes used > 0 but no images exist
        if (!hasImages && totalBytesUsed > 0 && !syncRecalcTriggeredRef.current) {
          syncRecalcTriggeredRef.current = true;

          // Automatically trigger forced recalculation to sync state
          const { refreshGalleryBytesOnly } = useGalleryStore.getState();
          void refreshGalleryBytesOnly(galleryId as string, true)
            .then(() => {
              // Sync recalculation completed
            })
            .catch((_err) => {
              // Reset trigger on error so we can retry
              syncRecalcTriggeredRef.current = false;
            });
        }
      })
      .catch((_err) => {
        // Failed to fetch images for check - silently continue
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, gallery, loading]); // Run when gallery data changes

  // Order action handlers using store actions directly
  // Note: Store actions already handle cache invalidation and reloading
  const handleApproveChangeRequest = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }
    await approveChangeRequest(galleryId as string, orderId as string);
    // Store action already reloads order, just refresh gallery orders list
    await loadGalleryOrders(true);
  }, [galleryId, orderId, approveChangeRequest, loadGalleryOrders]);

  const handleDenyChangeRequest = useCallback(() => {
    openDenyModal();
  }, [openDenyModal]);

  const handleDenyConfirm = useCallback(
    async (reason?: string) => {
      if (!galleryId || !orderId) {
        return;
      }
      await denyChangeRequest(galleryId as string, orderId as string, reason);
      closeDenyModal();
      // Store action already reloads order, just refresh gallery orders list
      await loadGalleryOrders(true);
    },
    [galleryId, orderId, denyChangeRequest, closeDenyModal, loadGalleryOrders]
  );

  const handleMarkOrderPaid = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }
    await markOrderPaid(galleryId as string, orderId as string);
  }, [galleryId, orderId, markOrderPaid]);

  const handleDownloadFinals = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }
    await downloadFinals(galleryId as string, orderId as string);
  }, [galleryId, orderId, downloadFinals]);

  const handleSendFinalsToClient = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }
    await sendFinalsToClient(galleryId as string, orderId as string);
  }, [galleryId, orderId, sendFinalsToClient]);

  const handleDownloadZip = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }
    await downloadZipAction(galleryId as string, orderId as string);
  }, [galleryId, orderId, downloadZipAction]);

  const handlePayClick = () => {
    if (!galleryId) {
      return;
    }
    setPublishWizardOpenStore(true, galleryId as string);
  };

  // Check URL params to auto-open wizard (but skip if gallery is already published)
  useEffect(() => {
    if (typeof window !== "undefined" && galleryId && router.isReady && gallery) {
      const params = new URLSearchParams(window.location.search);
      const publishParam = params.get("publish");
      const galleryParam = params.get("galleryId");

      if (publishParam === "true" && galleryParam === galleryId) {
        // Check if gallery is already published
        const isAlreadyPublished =
          gallery.state === "PAID_ACTIVE" || gallery.paymentStatus === "PAID";

        if (isAlreadyPublished) {
          // Gallery is already published - clean up URL params but don't open wizard
          cleanupPublishParams();
        } else {
          // Gallery is not published yet - open the wizard
          setPublishWizardOpenStore(true, galleryId);
        }
      }
    }
  }, [galleryId, router.isReady, gallery, setPublishWizardOpenStore, cleanupPublishParams]);

  // Clean up URL params when wizard closes (so NextStepsOverlay can show)
  useEffect(() => {
    if (typeof window !== "undefined" && router.isReady && galleryId) {
      // Only clean up if wizard is closed and we have publish params in URL
      if (!publishWizardOpen && router.query.publish === "true") {
        cleanupPublishParams();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishWizardOpen, router.isReady, router.query.publish, galleryId, cleanupPublishParams]);

  const confirmPayment = async () => {
    if (!galleryId || !paymentDetails) {
      return;
    }

    closePaymentModal();
    setPaymentLoading(true);

    try {
      // Backend will automatically use full Stripe if wallet is insufficient (no partial payments)
      const paymentResponse = await api.galleries.pay(galleryId as string, {});

      // Invalidate all caches to ensure fresh data on next fetch
      const { invalidateAllGalleryCaches } = useGalleryStore.getState();
      invalidateAllGalleryCaches(galleryId as string);
      const { invalidateGalleryOrdersCache } = useOrderStore.getState();
      invalidateGalleryOrdersCache(galleryId as string);
      if (paymentResponse.checkoutUrl) {
        window.location.href = paymentResponse.checkoutUrl;
      } else if (paymentResponse.paid) {
        showToast("success", "Sukces", "Galeria została opłacona z portfela!");
        await loadGalleryData(true); // Force refresh
        await refreshWalletBalance();

        // If we're on an order page, reload order data
        // The order page component will handle this via store subscriptions
        if (orderId) {
          await fetchOrder(galleryId as string, orderId as string, true);
        }
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się opłacić galerii");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCopyUrl = useCallback(() => {
    if (galleryId) {
      copyGalleryUrl(galleryId as string);
    }
  }, [galleryId, copyGalleryUrl]);

  const handleSendLink = useCallback(async () => {
    if (!galleryId || sendLinkLoading) {
      return;
    }

    try {
      const result = await sendGalleryLinkToClient(galleryId as string);

      showToast(
        "success",
        "Sukces",
        result.isReminder
          ? "Przypomnienie z linkiem do galerii zostało wysłane do klienta"
          : "Link do galerii został wysłany do klienta"
      );

      // Show success popup for initial invitations only
      if (!result.isReminder) {
        setShowClientSendPopup(true);
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  }, [galleryId, sendLinkLoading, sendGalleryLinkToClient, showToast]);

  const handleSettings = useCallback(() => {
    void router.push(`/galleries/${galleryId as string}/settings`);
  }, [router, galleryId]);

  // Restore cached gallery to store in useLayoutEffect (runs synchronously before paint)
  // This ensures other components that directly subscribe to currentGallery also see it
  const setCurrentGallery = useGalleryStore((state) => state.setCurrentGallery);
  const setCurrentGalleryId = useGalleryStore((state) => state.setCurrentGalleryId);
  const currentGalleryId = useGalleryStore((state) => state.currentGalleryId);

  // Check cache directly from store state (reactive) - use galleryIdStr or currentGalleryId as fallback
  const targetIdForCache = galleryIdStr ?? currentGalleryId;
  const cacheEntry = useGalleryStore((state) =>
    targetIdForCache ? state.galleryCache[targetIdForCache] : null
  );
  const cachedGallery =
    cacheEntry && Date.now() - cacheEntry.timestamp < 60000 ? cacheEntry.gallery : null;

  useLayoutEffect(() => {
    // If we have cached gallery but store doesn't have it, restore it
    const targetId = galleryIdStr ?? currentGalleryId;
    if (cachedGallery?.galleryId === targetId && gallery?.galleryId !== targetId) {
      setCurrentGallery(cachedGallery);
      setCurrentGalleryId(targetId);
    }
  }, [
    cachedGallery,
    galleryIdStr,
    currentGalleryId,
    gallery?.galleryId,
    setCurrentGallery,
    setCurrentGalleryId,
  ]);

  // Gallery selector already includes cache, so use it directly
  // But also check cachedGallery as fallback to ensure we have gallery if it's cached
  const effectiveGallery =
    gallery ?? (cachedGallery?.galleryId === galleryIdStr ? cachedGallery : null);

  // Check if we're on an order page
  const orderIdFromQuery = Array.isArray(orderId) ? orderId[0] : orderId;
  const orderIdStr = typeof orderIdFromQuery === "string" ? orderIdFromQuery : undefined;
  const isOrderPage = !!orderIdStr;

  // Check if we have the matching order - check currentOrder and orderCache
  // orderCache is the single source of truth, populated by both fetchOrder and fetchGalleryOrders
  const orderCache = useOrderStore((state) =>
    orderIdStr ? state.orderCache[orderIdStr] : null
  );
  // Check if order matches - be explicit about the comparison
  const orderMatches = orderIdStr
    ? (currentOrder?.orderId === orderIdStr) || 
      (orderCache?.order?.orderId === orderIdStr)
    : false;
  const hasOrder = isOrderPage && orderMatches;

  // Track successfully loaded orderIds to prevent flickering on refreshes
  const loadedOrderIdsRef = React.useRef<Set<string>>(new Set());
  
  // Update the set when we successfully have an order (in store or cache)
  // This marks that we've loaded this order, so we don't show loading again
  // NOTE: The order page component will show its own loading while images are loading,
  // so we can mark as loaded once the order is in cache
  useEffect(() => {
    if (isOrderPage && orderIdStr) {
      // Check if order is in store
      const orderInStore = currentOrder?.orderId === orderIdStr;
      // Check if order is in cache
      const orderInCache = orderCache?.order?.orderId === orderIdStr;
      
      // Mark as loaded if we have the order in store or cache
      // The order page will handle its own loading state for images
      if (orderInStore || orderInCache) {
        loadedOrderIdsRef.current.add(orderIdStr);
      }
    }
  }, [isOrderPage, orderIdStr, currentOrder?.orderId, orderCache?.order?.orderId]);
  
  // Clear loaded orders when navigating away from order pages
  useEffect(() => {
    if (!isOrderPage) {
      loadedOrderIdsRef.current.clear();
    }
  }, [isOrderPage]);

  // Stable loading condition using useMemo to prevent flickering
  // Order page now owns its loading, so we just check if we have the order
  // Show loading when:
  // - We're on an order page AND
  // - We don't have the order AND we haven't loaded it before (initial load only)
  // NOTE: The order page component will show its own loading while images are loading,
  // so we only need to show loading here for the initial order fetch
  const isOrderLoading = useMemo(() => {
    if (!isOrderPage || !orderIdStr) {
      return false;
    }
    
    // Check if order is in store or cache (orderCache is single source of truth)
    const orderInStore = currentOrder?.orderId === orderIdStr;
    const orderInCache = orderCache?.order?.orderId === orderIdStr;
    const hasOrderNow = orderInStore || orderInCache;
    
    // If we've successfully loaded this order before, don't show loading during refreshes
    const hasLoadedBefore = loadedOrderIdsRef.current.has(orderIdStr);
    
    // If we have the order, we're not loading (order page will handle its own loading for images)
    if (hasOrderNow) {
      return false;
    }
    
    // Show loading only if we don't have the order AND we haven't loaded it before
    // The order page component will handle its own loading state internally
    return !hasLoadedBefore;
  }, [isOrderPage, orderIdStr, currentOrder?.orderId, orderCache?.order?.orderId]);

  // Show loading if:
  // 1. Gallery is loading AND we don't have gallery (from store or cache)
  // 2. OR Order is loading (on order page) AND we don't have the matching order yet
  // Don't show duplicate loading if galleryCreationLoading is already showing
  // galleryCreationLoading will be shown by the gallery detail/photos page
  const hasGallery = !!effectiveGallery && effectiveGallery.galleryId === galleryIdStr;
  const shouldShowLoading =
    router.isReady && ((loading && !hasGallery) || isOrderLoading) && !galleryCreationLoading;

  // Only log when state actually changes to reduce spam
  const prevStateRef = React.useRef({
    shouldShowLoading: false,
    loading,
    hasGallery: false,
    effectiveGalleryId: null as string | null | undefined,
    isOrderPage: false,
    orderMatches: false,
    hasOrder: false,
    isOrderLoading: false,
  });
  const stateChanged =
    prevStateRef.current.shouldShowLoading !== shouldShowLoading ||
    prevStateRef.current.loading !== loading ||
    prevStateRef.current.hasGallery !== hasGallery ||
    prevStateRef.current.effectiveGalleryId !== effectiveGallery?.galleryId ||
    prevStateRef.current.isOrderPage !== isOrderPage ||
    prevStateRef.current.orderMatches !== orderMatches ||
    prevStateRef.current.hasOrder !== hasOrder ||
    prevStateRef.current.isOrderLoading !== isOrderLoading;

  if (stateChanged) {
    prevStateRef.current = {
      shouldShowLoading,
      loading,
      hasGallery,
      effectiveGalleryId: effectiveGallery?.galleryId,
      isOrderPage,
      orderMatches,
      hasOrder,
      isOrderLoading,
    };
  }

  if (shouldShowLoading && !galleryCreationLoading) {
    if (process.env.NODE_ENV === "development" && stateChanged) {
      // eslint-disable-next-line no-console
      console.log("[GalleryLayoutWrapper] FullPageLoading: Showing", {
        galleryId: galleryIdStr,
        orderId: orderIdStr,
        loading,
        isOrderPage,
        orderMatches,
        hasOrder,
        isOrderLoading,
        effectiveGallery: effectiveGallery ? { galleryId: effectiveGallery.galleryId } : null,
        currentOrder: currentOrder ? { orderId: currentOrder.orderId } : null,
        hasGallery,
        galleryCreationLoading,
        routerReady: router.isReady,
        cachedGallery: cachedGallery ? { galleryId: cachedGallery.galleryId } : null,
        loadedOrderIds: Array.from(loadedOrderIdsRef.current),
        timestamp: new Date().toISOString(),
      });
    }
    const loadingText =
      isOrderPage && isOrderLoading ? "Ładowanie zlecenia..." : "Ładowanie galerii...";
    return (
      <GalleryLayout>
        <FullPageLoading text={loadingText} />
      </GalleryLayout>
    );
  }

  if (process.env.NODE_ENV === "development" && !shouldShowLoading && stateChanged) {
    // eslint-disable-next-line no-console
    console.log("[GalleryLayoutWrapper] FullPageLoading: Hidden", {
      galleryId: galleryIdStr,
      orderId: orderIdStr,
      loading,
      isOrderPage,
      orderMatches,
      hasOrder,
      isOrderLoading,
      effectiveGallery: effectiveGallery ? { galleryId: effectiveGallery.galleryId } : null,
      currentOrder: currentOrder ? { orderId: currentOrder.orderId } : null,
      hasGallery,
      galleryCreationLoading,
      routerReady: router.isReady,
      cachedGallery: cachedGallery ? { galleryId: cachedGallery.galleryId } : null,
      loadedOrderIds: Array.from(loadedOrderIdsRef.current),
      timestamp: new Date().toISOString(),
    });
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
      <GalleryLayout>
        {isPublishWizardOpenForThisGallery ? (
          <PublishGalleryWizard
            isOpen={isPublishWizardOpenForThisGallery}
            onClose={() => {
              setPublishWizardOpenStore(false);
              // Clean up URL params when wizard closes so NextStepsOverlay can show
              cleanupPublishParams();
            }}
            galleryId={galleryId}
            onSuccess={async () => {
              // Reload gallery data to update payment status
              if (galleryId) {
                await reloadGallery(galleryId, true);
              }
              await refreshWalletBalance();
              // If we're on an order page, reload order data
              // Store updates will trigger re-renders automatically via Zustand subscriptions
              if (orderId) {
                await fetchOrder(galleryId as string, orderId as string, true);
              }
            }}
          />
        ) : (
          children
        )}
      </GalleryLayout>

      <DenyChangeRequestModal
        isOpen={denyModalOpen}
        onClose={closeDenyModal}
        onConfirm={handleDenyConfirm}
        loading={denyLoading}
      />

      {showPaymentModal && (
        <PaymentConfirmationModal
          isOpen={showPaymentModal}
          onClose={closePaymentModal}
          onConfirm={confirmPayment}
          totalAmountCents={paymentDetails.totalAmountCents}
          walletBalanceCents={walletBalance ?? 0}
          walletAmountCents={paymentDetails.walletAmountCents}
          stripeAmountCents={paymentDetails.stripeAmountCents}
          loading={paymentLoading}
        />
      )}

      {/* Client Send Success Popup */}
      <ClientSendSuccessPopup
        isOpen={showClientSendPopup}
        onClose={() => setShowClientSendPopup(false)}
        galleryName={gallery?.galleryName}
      />
    </>
  );
}
