import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback } from "react";

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
  const {
    currentGallery: gallery,
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

  // Clear order state when navigating away from order page (but staying in gallery routes)
  useEffect(() => {
    // Clear order when orderId is removed from URL but we're still in gallery routes
    if (!orderId && currentOrderId && router.pathname.includes("/galleries/")) {
      clearCurrentOrder();
    }
  }, [orderId, currentOrderId, router.pathname, clearCurrentOrder]);

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
      if (!url.includes("/galleries/")) {
        clearCurrentGallery();
        clearCurrentOrder();
      }
    };

    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [router, clearCurrentGallery, clearCurrentOrder]);

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

  useEffect(() => {
    if (router.isReady && apiUrl && idToken && galleryId) {
      // Always ensure gallery is loaded - reload if galleryId changed or gallery is missing
      if (!gallery || gallery.galleryId !== galleryId) {
        void loadGalleryData(false, true); // Force refresh
      }
      // Refresh wallet balance only when we have a valid token (userSlice handles its own caching)
      if (idToken && idToken.trim() !== "") {
        void refreshWalletBalance();
      }
      void checkDeliveredOrders();
      void loadGalleryOrders(true); // Force refresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, apiUrl, idToken, galleryId]);

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

  // Check URL params to auto-open wizard
  useEffect(() => {
    if (typeof window !== "undefined" && galleryId && router.isReady) {
      const params = new URLSearchParams(window.location.search);
      const publishParam = params.get("publish");
      const galleryParam = params.get("galleryId");

      if (publishParam === "true" && galleryParam === galleryId) {
        setPublishWizardOpenStore(true, galleryId);
      }
    }
  }, [galleryId, router.isReady]);

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

  // Defensive check: Show loading only if we don't have gallery data yet
  if (loading && !gallery) {
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
        <div className="p-6">
          <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600">
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
