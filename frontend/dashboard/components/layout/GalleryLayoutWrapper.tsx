import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback } from "react";

import { GalleryProvider } from "../../context/GalleryContext";
import { useZipDownload as useZipDownloadHook } from "../../hocs/withZipDownload";
import { useGalleryData } from "../../hooks/useGalleryData";
import { useModal } from "../../hooks/useModal";
import { useOrderActions } from "../../hooks/useOrderActions";
import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { useGalleryStore } from "../../store/gallerySlice";
import { useOrderStore } from "../../store/orderSlice";
import { useUserStore } from "../../store/userSlice";
import { ClientSendSuccessPopup } from "../galleries/ClientSendSuccessPopup";
import PaymentConfirmationModal from "../galleries/PaymentConfirmationModal";
import { PublishGalleryWizard } from "../galleries/PublishGalleryWizard";
import { CleanupOriginalsModal } from "../orders/CleanupOriginalsModal";
import { DenyChangeRequestModal } from "../orders/DenyChangeRequestModal";
import { FullPageLoading } from "../ui/loading/Loading";
import { WelcomePopupWrapper } from "../welcome/WelcomePopupWrapper";

import GalleryLayout from "./GalleryLayout";

interface GalleryLayoutWrapperProps {
  children: React.ReactNode;
}

// Local Order type for gallery orders list (orderId is optional in API responses)
interface Order {
  orderId?: string;
  galleryId?: string;
  deliveryStatus?: string;
  [key: string]: unknown;
}

export default function GalleryLayoutWrapper({ children }: GalleryLayoutWrapperProps) {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const { showToast } = useToast();
  const { downloadZip } = useZipDownloadHook();

  // Zustand stores
  const {
    currentGallery: gallery,
    isLoading: loading,
    error: loadError,
    clearCurrentGallery,
    isGalleryStale,
    invalidateGalleryCache,
    invalidateGalleryOrdersCache,
  } = useGalleryStore();
  // Use selector to ensure re-render when order changes - watch deliveryStatus specifically
  const order = useOrderStore((state) => state.currentOrder);
  const deliveryStatus = useOrderStore((state) => state.currentOrder?.deliveryStatus);
  const setCurrentOrder = useOrderStore((state) => state.setCurrentOrder);
  const clearCurrentOrder = useOrderStore((state) => state.clearCurrentOrder);
  const invalidateOrderStoreGalleryCache = useOrderStore(
    (state) => state.invalidateGalleryOrdersCache
  );
  const { walletBalanceCents: walletBalance, refreshWalletBalance } = useUserStore();

  // Modal hooks
  const { isOpen: showPaymentModal, closeModal: closePaymentModal } = useModal("payment");
  const {
    isOpen: denyModalOpen,
    openModal: openDenyModal,
    closeModal: closeDenyModal,
  } = useModal("deny-change");
  const {
    isOpen: cleanupModalOpen,
    openModal: openCleanupModal,
    closeModal: closeCleanupModal,
  } = useModal("cleanup-originals");

  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [galleryUrl, setGalleryUrl] = useState("");
  const [hasDeliveredOrders, setHasDeliveredOrders] = useState<boolean | undefined>(undefined);
  const [galleryOrders, setGalleryOrdersLocal] = useState<Order[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [denyLoading, setDenyLoading] = useState(false);
  const [sendLinkLoading, setSendLinkLoading] = useState(false);
  const [paymentDetails] = useState({
    totalAmountCents: 0,
    walletAmountCents: 0,
    stripeAmountCents: 0,
    balanceAfterPayment: 0,
  });
  const [publishWizardOpen, setPublishWizardOpen] = useState(false);
  const [showClientSendPopup, setShowClientSendPopup] = useState(false);

  // Use custom hooks for gallery data and order actions
  const { loadGalleryData, loadGalleryOrders, checkDeliveredOrders } = useGalleryData({
    apiUrl,
    idToken,
    galleryId,
    setGalleryUrl,
    setGalleryOrdersLocal,
    setHasDeliveredOrders,
  });

  const loadOrderData = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }
    try {
      // Use store action - checks cache first, fetches if needed
      const { fetchOrder } = useOrderStore.getState();
      const orderData = await fetchOrder(galleryId as string, orderId as string);

      // Store action already updates the store, but ensure currentOrder is set
      if (orderData) {
        setCurrentOrder(orderData);
      } else {
        setCurrentOrder(null);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch (_err) {
      setCurrentOrder(null);
    }
  }, [galleryId, orderId, setCurrentOrder]);

  // Clear state when navigating away
  useEffect(() => {
    return () => {
      if (!router.pathname.includes("/galleries/")) {
        clearCurrentGallery();
        clearCurrentOrder();
      }
    };
  }, [router.pathname, clearCurrentGallery, clearCurrentOrder]);

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
      // Only reload if galleryId changed or we don't have gallery data yet or cache is stale
      if (gallery?.galleryId !== galleryId || isGalleryStale(30000)) {
        void loadGalleryData(false, false); // Use cache if fresh
      }
      // Refresh wallet balance only when we have a valid token (userSlice handles its own caching)
      if (idToken && idToken.trim() !== "") {
        void refreshWalletBalance();
      }
      void checkDeliveredOrders();
      void loadGalleryOrders(false); // Use cache if fresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, apiUrl, idToken, galleryId]);

  useEffect(() => {
    if (router.isReady && apiUrl && idToken && galleryId && orderId) {
      void loadOrderData();
    } else {
      setCurrentOrder(null);
    }
  }, [router.isReady, apiUrl, idToken, galleryId, orderId, setCurrentOrder, loadOrderData]);

  // Listen for order updates from order page (e.g., after final upload)
  useEffect(() => {
    if (!orderId) {
      return undefined;
    }

    const handleOrderUpdate = async (event: Event) => {
      const customEvent = event as CustomEvent<{ orderId?: string }>;
      // Only reload if this is the same order
      if (customEvent.detail?.orderId === orderId) {
        // Reload order data immediately to update sidebar
        await loadOrderData();
        // Also refresh delivered orders check in case status changed to DELIVERED
        await checkDeliveredOrders();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("orderUpdated", handleOrderUpdate);
      return () => {
        window.removeEventListener("orderUpdated", handleOrderUpdate);
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Force re-render when order deliveryStatus changes - this ensures sidebar buttons update
  // MUST be before any early returns to follow Rules of Hooks
  useEffect(() => {
    // This effect will run when deliveryStatus changes
    // The orderObj, hasFinals, and canDownloadZip will be recomputed
  }, [deliveryStatus]);

  // Use custom hook for order actions
  const {
    handleApproveChangeRequest,
    handleDenyChangeRequest,
    handleDenyConfirm: handleDenyConfirmFromHook,
    handleMarkOrderPaid,
    handleDownloadFinals,
    handleSendFinalsToClient,
    handleCleanupConfirm,
    handleCleanupCancel,
    handleCleanupClose,
  } = useOrderActions({
    apiUrl,
    idToken,
    galleryId,
    orderId,
    gallery,
    loadOrderData,
    loadGalleryOrders,
    openDenyModal,
    closeDenyModal,
    setDenyLoading,
    openCleanupModal,
    closeCleanupModal,
  });

  // Wrap handleDenyConfirm to match the expected signature
  const handleDenyConfirm = async (reason?: string) => {
    await handleDenyConfirmFromHook(reason);
  };

  const handleDownloadZip = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId || !order) {
      return;
    }

    await downloadZip({
      apiUrl,
      galleryId: galleryId as string,
      orderId: orderId as string,
    });
  };

  const handlePayClick = () => {
    if (!galleryId) {
      return;
    }
    setPublishWizardOpen(true);
  };

  // Check URL params to auto-open wizard
  useEffect(() => {
    if (typeof window !== "undefined" && galleryId && router.isReady) {
      const params = new URLSearchParams(window.location.search);
      const publishParam = params.get("publish");
      const galleryParam = params.get("galleryId");

      if (publishParam === "true" && galleryParam === galleryId) {
        setPublishWizardOpen(true);
      }
    }
  }, [galleryId, router.isReady]);

  // Listen for custom events from NextStepsOverlay
  useEffect(() => {
    const handleOpenPublishWizard = (event: CustomEvent) => {
      if (event.detail?.galleryId === galleryId) {
        setPublishWizardOpen(true);
      }
    };

    const handleSendGalleryLink = (event: CustomEvent) => {
      if (event.detail?.galleryId === galleryId) {
        void handleSendLink();
      }
    };

    window.addEventListener("openPublishWizard", handleOpenPublishWizard as EventListener);
    window.addEventListener("sendGalleryLink", handleSendGalleryLink as EventListener);

    return () => {
      window.removeEventListener("openPublishWizard", handleOpenPublishWizard as EventListener);
      window.removeEventListener("sendGalleryLink", handleSendGalleryLink as EventListener);
    };
  }, [galleryId]);

  const confirmPayment = async () => {
    if (!galleryId || !paymentDetails) {
      return;
    }

    closePaymentModal();
    setPaymentLoading(true);

    try {
      // Backend will automatically use full Stripe if wallet is insufficient (no partial payments)
      const paymentResponse = await api.galleries.pay(galleryId as string, {});

      // Invalidate cache to force fresh data fetch after payment
      invalidateGalleryCache(galleryId as string);
      invalidateGalleryOrdersCache(galleryId as string);
      invalidateOrderStoreGalleryCache(galleryId as string);
      if (paymentResponse.checkoutUrl) {
        window.location.href = paymentResponse.checkoutUrl;
      } else if (paymentResponse.paid) {
        showToast("success", "Sukces", "Galeria została opłacona z portfela!");
        await loadGalleryData(true); // Force refresh
        await refreshWalletBalance();

        // If we're on an order page, reload order data and notify the order page
        if (orderId) {
          await loadOrderData();
          // Dispatch event to notify order page to refresh
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("orderUpdated", { detail: { orderId } }));
            // Also dispatch a gallery payment event to ensure order page refreshes
            window.dispatchEvent(
              new CustomEvent("galleryPaymentCompleted", { detail: { galleryId } })
            );
          }
        }
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się opłacić galerii");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (typeof window !== "undefined" && galleryUrl) {
      void navigator.clipboard.writeText(galleryUrl).catch(() => {
        // Ignore clipboard errors
      });
    }
  };

  const handleSendLink = async () => {
    if (!galleryId || sendLinkLoading) {
      return;
    }

    // Check if this is a reminder (has existing orders) or initial invitation
    const isReminder = galleryOrders && galleryOrders.length > 0;

    setSendLinkLoading(true);

    try {
      const response = await api.galleries.sendToClient(galleryId as string);
      const isReminderResponse = response.isReminder ?? isReminder;

      showToast(
        "success",
        "Sukces",
        isReminderResponse
          ? "Przypomnienie z linkiem do galerii zostało wysłane do klienta"
          : "Link do galerii został wysłany do klienta"
      );

      // Only reload if it's an initial invitation (creates order), not for reminders
      if (!isReminderResponse) {
        // Reload gallery data and orders to get the newly created CLIENT_SELECTING order
        await loadGalleryData();
        await loadGalleryOrders();

        // Trigger event to reload orders if we're on the gallery detail page
        if (typeof window !== "undefined") {
          void window.dispatchEvent(
            new CustomEvent("galleryOrdersUpdated", { detail: { galleryId } })
          );
        }

        // Show success popup for initial invitations only
        setShowClientSendPopup(true);
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setSendLinkLoading(false);
    }
  };

  const handleSettings = () => {
    void router.push(`/galleries/${galleryId as string}/settings`);
  };

  // Show loading only if we don't have gallery data yet
  if (loading && !gallery) {
    return (
      <GalleryLayout
        gallery={null}
        isPaid={false}
        galleryUrl=""
        onCopyUrl={() => {}}
        onSendLink={() => {}}
        onSettings={() => {}}
        onReloadGallery={loadGalleryData}
        hasDeliveredOrders={undefined}
      >
        <FullPageLoading text="Ładowanie galerii..." />
      </GalleryLayout>
    );
  }

  // Only show error if we've tried to load and failed (not during initial load)
  if (!gallery && loadError && !loading) {
    return (
      <GalleryLayout
        gallery={null}
        isPaid={false}
        galleryUrl=""
        onCopyUrl={() => {}}
        onSendLink={() => {}}
        onSettings={() => {}}
        onReloadGallery={loadGalleryData}
        hasDeliveredOrders={undefined}
      >
        <div className="p-6">
          <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600">
            {loadError}
          </div>
        </div>
      </GalleryLayout>
    );
  }

  // Only calculate isPaid when gallery is fully loaded to prevent flash of unpaid state
  const isPaid = gallery?.galleryId
    ? gallery.isPaid !== false &&
      (gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE")
    : false;

  // Calculate canDownloadZip for order
  // Only show ZIP download if selection is enabled (ZIP contains selected photos)
  // ZIP is available before finals upload
  // Parse order if needed - order comes from Zustand store and should be an object
  interface OrderObj {
    deliveryStatus?: string;
    [key: string]: unknown;
  }
  const orderObj: OrderObj | null =
    order && typeof order === "object"
      ? (order as OrderObj)
      : order && typeof order === "string"
        ? (() => {
            try {
              return JSON.parse(order) as OrderObj;
            } catch {
              return null;
            }
          })()
        : null;

  const selectionEnabled = gallery?.selectionEnabled !== false; // Default to true if not specified

  // Check if finals are uploaded - finals exist if deliveryStatus indicates they've been uploaded
  // Backend uses PREPARING_DELIVERY (without "FOR")
  // Status is updated automatically by backend when first final is uploaded or last final is deleted
  const hasFinals =
    orderObj?.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
    orderObj?.deliveryStatus === "PREPARING_DELIVERY" ||
    orderObj?.deliveryStatus === "DELIVERED";

  // ZIP download is available if:
  // Order is in CLIENT_APPROVED or AWAITING_FINAL_PHOTOS status (before finals upload)
  const canDownloadZip =
    orderObj && selectionEnabled
      ? orderObj.deliveryStatus === "CLIENT_APPROVED" ||
        orderObj.deliveryStatus === "AWAITING_FINAL_PHOTOS"
      : false;

  return (
    <GalleryProvider
      gallery={gallery}
      loading={loading}
      error={loadError}
      galleryId={galleryId as string}
      reloadGallery={() => loadGalleryData(true)}
      reloadOrder={orderId ? () => loadOrderData() : undefined}
    >
      <WelcomePopupWrapper />
      <GalleryLayout
        gallery={gallery ? { ...gallery, orders: galleryOrders } : null}
        isPaid={isPaid}
        galleryUrl={galleryUrl}
        onCopyUrl={handleCopyUrl}
        onSendLink={handleSendLink}
        sendLinkLoading={sendLinkLoading}
        onSettings={handleSettings}
        onReloadGallery={async () => {
          await loadGalleryData(true);
          await loadGalleryOrders();
        }}
        order={orderObj}
        orderId={orderId as string}
        onDownloadZip={orderId ? handleDownloadZip : undefined}
        canDownloadZip={canDownloadZip}
        onMarkOrderPaid={orderId ? handleMarkOrderPaid : undefined}
        onDownloadFinals={orderId ? handleDownloadFinals : undefined}
        onSendFinalsToClient={orderId ? handleSendFinalsToClient : undefined}
        onApproveChangeRequest={orderId ? handleApproveChangeRequest : undefined}
        onDenyChangeRequest={orderId ? handleDenyChangeRequest : undefined}
        hasFinals={hasFinals}
        hasDeliveredOrders={hasDeliveredOrders}
        galleryLoading={loading}
      >
        {publishWizardOpen ? (
          <PublishGalleryWizard
            isOpen={publishWizardOpen}
            onClose={() => {
              setPublishWizardOpen(false);
            }}
            galleryId={galleryId as string}
            onSuccess={async () => {
              // Reload gallery data to update payment status
              await loadGalleryData();
              await refreshWalletBalance();
              // If we're on an order page, reload order data
              if (orderId) {
                await loadOrderData();
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("galleryPaymentCompleted", { detail: { galleryId } })
                  );
                }
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

      <CleanupOriginalsModal
        isOpen={cleanupModalOpen}
        onClose={handleCleanupClose}
        onConfirm={handleCleanupConfirm}
        onCancel={handleCleanupCancel}
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
    </GalleryProvider>
  );
}
