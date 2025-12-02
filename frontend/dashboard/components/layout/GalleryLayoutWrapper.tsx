import { useRouter } from "next/router";
import React, { useState, useEffect, useLayoutEffect, useCallback } from "react";

import { useGalleryData } from "../../hooks/useGalleryData";
import { useModal } from "../../hooks/useModal";
import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { useGalleryStore } from "../../store/gallerySlice";
import { useOrderStore } from "../../store/orderSlice";
import { useUserStore } from "../../store/userSlice";
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
        if (age < 60000) { // Cache TTL: 60 seconds
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
    galleryUrl,
    hasDeliveredOrders,
    reloadGallery,
    copyGalleryUrl,
  } = useGalleryStore();

  const {
    currentOrder: order,
    currentOrderId,
    clearCurrentOrder,
    fetchOrder,
    denyLoading,
    cleanupLoading,
    approveChangeRequest,
    denyChangeRequest,
    markOrderPaid,
    downloadFinals,
    sendFinalsToClient,
    downloadZip: downloadZipAction,
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

  const loadOrderData = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }
    try {
      // Use store action - checks cache first, fetches if needed
      // Store action automatically updates currentOrder
      await fetchOrder(galleryId as string, orderId as string);
    } catch (_err) {
      // Store action handles errors internally
    }
  }, [galleryId, orderId, fetchOrder]);

  // Helper function to clean up publish wizard URL params
  const cleanupPublishParams = useCallback(() => {
    if (typeof window === "undefined" || !router.isReady) {return;}

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
      const { currentGalleryId: storeGalleryId, currentGallery: storeGallery, setCurrentGalleryId, setCurrentGallery, getGalleryFromCache } = useGalleryStore.getState();
      if (storeGalleryId !== galleryId || storeGallery?.galleryId !== galleryId) {
        // Only set if we have cached gallery data, otherwise let the load effect handle it
        const cached = getGalleryFromCache(galleryId, 60000);
        if (cached?.galleryId === galleryId) {
          console.log("[GalleryLayoutWrapper] Restoring gallery from cache in order clear effect:", galleryId);
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
      console.log("[GalleryLayoutWrapper] Route change:", {
        url,
        isGalleryRoute: url.includes("/galleries/"),
        willClearGallery: !url.includes("/galleries/"),
      });
      
      // Close publish wizard when navigating away
      if (publishWizardOpen) {
        setPublishWizardOpenStore(false);
        cleanupPublishParams();
      }
      // ONLY clear gallery when navigating AWAY from gallery routes
      // Do NOT clear when navigating between gallery routes (e.g., photos -> settings)
      if (!url.includes("/galleries/")) {
        console.log("[GalleryLayoutWrapper] Clearing gallery (navigating away from gallery routes)");
        clearCurrentGallery();
        clearCurrentOrder();
      } else {
        console.log("[GalleryLayoutWrapper] Staying in gallery routes, preserving gallery state");
      }
    };

    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [router, clearCurrentGallery, clearCurrentOrder, publishWizardOpen, setPublishWizardOpenStore, cleanupPublishParams]);

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
  
  useEffect(() => {
    const currentGalleryId = galleryId as string;
    
    // Skip if we've already loaded this gallery (unless it's a different gallery)
    if (loadedGalleryIdRef.current === currentGalleryId && gallery?.galleryId === currentGalleryId) {
      return;
    }
    
    console.log("[GalleryLayoutWrapper] Gallery load effect:", {
      routerReady: router.isReady,
      hasApiUrl: !!apiUrl,
      hasIdToken: !!idToken,
      galleryId: currentGalleryId,
      currentGalleryId: gallery?.galleryId,
      galleryMatches: gallery?.galleryId === currentGalleryId,
      alreadyLoaded: loadedGalleryIdRef.current === currentGalleryId,
    });
    
    if (router.isReady && apiUrl && idToken && currentGalleryId) {
      // Check cache first - if we have cached data for this gallery, use it
      const { getGalleryFromCache, setCurrentGallery, setCurrentGalleryId } = useGalleryStore.getState();
      const cachedGallery = getGalleryFromCache(currentGalleryId, 60000);
      
      console.log("[GalleryLayoutWrapper] Cache check:", {
        hasCachedGallery: !!cachedGallery,
        cachedGalleryId: cachedGallery?.galleryId,
        matches: cachedGallery?.galleryId === currentGalleryId,
      });
      
      // If we have cached gallery and it matches, use it immediately (no loading state)
      if (cachedGallery?.galleryId === currentGalleryId) {
        console.log("[GalleryLayoutWrapper] Using cached gallery, setting in store");
        setCurrentGallery(cachedGallery);
        setCurrentGalleryId(currentGalleryId);
        loadedGalleryIdRef.current = currentGalleryId; // Mark as loaded
      }
      
      // Only fetch if gallery doesn't match AND we don't have cache
      if (gallery?.galleryId !== currentGalleryId && !cachedGallery) {
        console.log("[GalleryLayoutWrapper] Gallery mismatch and no cache, loading:", {
          expected: currentGalleryId,
          current: gallery?.galleryId,
        });
        loadedGalleryIdRef.current = currentGalleryId; // Mark as loading
        void loadGalleryData(false, true).then(() => {
          // Mark as loaded after fetch completes
          loadedGalleryIdRef.current = currentGalleryId;
        }); // Force refresh only if not in cache
      } else if (gallery?.galleryId === currentGalleryId) {
        console.log("[GalleryLayoutWrapper] Gallery matches, skipping load");
        loadedGalleryIdRef.current = currentGalleryId; // Mark as loaded
      }
      
      // Refresh wallet balance only when we have a valid token (userSlice handles its own caching)
      if (idToken && idToken.trim() !== "") {
        void refreshWalletBalance();
      }
      void checkDeliveredOrders();
      void loadGalleryOrders(true); // Force refresh
    } else {
      console.log("[GalleryLayoutWrapper] Not ready to load:", {
        routerReady: router.isReady,
        hasApiUrl: !!apiUrl,
        hasIdToken: !!idToken,
        galleryId: currentGalleryId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, apiUrl, idToken, galleryId]); // Removed gallery from deps to prevent loops

  useEffect(() => {
    if (router.isReady && apiUrl && idToken && galleryId && orderId) {
      void loadOrderData();
    }
  }, [router.isReady, apiUrl, idToken, galleryId, orderId, loadOrderData]);

  // Watch order cache and reload when order updates (Zustand subscriptions)
  const orderCache = useOrderStore((state) =>
    orderId ? state.orderCache[orderId as string] : null
  );
  useEffect(() => {
    if (orderId && orderCache) {
      // Order was updated in store, reload to get latest data
      void loadOrderData();
      void checkDeliveredOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, orderCache?.timestamp]);

  // Order action handlers using store actions directly
  const handleApproveChangeRequest = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }
    await approveChangeRequest(galleryId as string, orderId as string);
    await loadOrderData();
    await loadGalleryOrders(true);
  }, [galleryId, orderId, approveChangeRequest, loadOrderData, loadGalleryOrders]);

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
      await loadOrderData();
      await loadGalleryOrders(true);
    },
    [galleryId, orderId, denyChangeRequest, closeDenyModal, loadOrderData, loadGalleryOrders]
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

        // If we're on an order page, reload order data and notify the order page
        if (orderId) {
          await loadOrderData();
          // Store updates will trigger re-renders automatically via Zustand subscriptions
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
  const cacheEntry = useGalleryStore((state) => targetIdForCache ? state.galleryCache[targetIdForCache] : null);
  const cachedGallery = cacheEntry && (Date.now() - cacheEntry.timestamp < 60000) ? cacheEntry.gallery : null;
  
  useLayoutEffect(() => {
    // If we have cached gallery but store doesn't have it, restore it
    const targetId = galleryIdStr ?? currentGalleryId;
    if (cachedGallery?.galleryId === targetId && (gallery?.galleryId !== targetId)) {
      console.log("[GalleryLayoutWrapper] Restoring cached gallery to store (useLayoutEffect):", {
        cachedGalleryId: cachedGallery.galleryId,
        galleryId: targetId,
        storeHasGallery: !!gallery,
        storeGalleryId: gallery?.galleryId,
      });
      setCurrentGallery(cachedGallery);
      setCurrentGalleryId(targetId);
    }
  }, [cachedGallery?.galleryId, galleryIdStr, currentGalleryId, gallery?.galleryId, setCurrentGallery, setCurrentGalleryId]);
  
  // Gallery selector already includes cache, so use it directly
  const effectiveGallery = gallery;
  
  // Only log when state actually changes to reduce spam
  const prevStateRef = React.useRef({ loading, hasGallery: !!gallery, hasCachedGallery: !!cachedGallery });
  if (
    prevStateRef.current.loading !== loading ||
    prevStateRef.current.hasGallery !== !!gallery ||
    prevStateRef.current.hasCachedGallery !== !!cachedGallery
  ) {
    console.log("[GalleryLayoutWrapper] Loading check:", {
      loading,
      hasGallery: !!gallery,
      hasCachedGallery: !!cachedGallery,
      hasEffectiveGallery: !!effectiveGallery,
      galleryId: galleryIdStr,
      shouldShowLoading: loading && !effectiveGallery,
    });
    prevStateRef.current = { loading, hasGallery: !!gallery, hasCachedGallery: !!cachedGallery };
  }
  
  // Only show loading if we're loading AND we don't have gallery (including cached)
  if (loading && !effectiveGallery) {
    return (
      <GalleryLayout>
        <FullPageLoading text="Ładowanie galerii..." />
      </GalleryLayout>
    );
  }

  // Defensive check: Only show error if we've tried to load and failed (not during initial load)
  if (!gallery && loadError && !loading) {
    return (
      <GalleryLayout>
        <div className="p-4">
          <div>
            {loadError}
          </div>
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
                await loadOrderData();
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
