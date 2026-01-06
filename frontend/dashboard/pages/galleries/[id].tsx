import { useQueryClient } from "@tanstack/react-query";
import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect, useCallback } from "react";

import { NextStepsOverlay } from "../../components/galleries/NextStepsOverlay";
import PaymentConfirmationModal from "../../components/galleries/PaymentConfirmationModal";
import { useGalleryType } from "../../components/hocs/withGalleryType";
import { DenyChangeRequestModal } from "../../components/orders/DenyChangeRequestModal";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import { FullPageLoading } from "../../components/ui/loading/Loading";
import { Modal } from "../../components/ui/modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../../components/ui/table";
import { usePayGallery, useSendGalleryToClient } from "../../hooks/mutations/useGalleryMutations";
import {
  useApproveChangeRequest,
  useDenyChangeRequest,
} from "../../hooks/mutations/useOrderMutations";
import { useGallery } from "../../hooks/queries/useGalleries";
import { useOrders } from "../../hooks/queries/useOrders";
import { useGalleryCreationLoading } from "../../hooks/useGalleryCreationLoading";
import { usePageLogger } from "../../hooks/usePageLogger";
import { useToast } from "../../hooks/useToast";
import { formatApiError } from "../../lib/api-service";
import { formatPrice } from "../../lib/format-price";
import { formatOrderDisplay } from "../../lib/orderDisplay";
import { useUnifiedStore } from "../../store/unifiedStore";
import type { Gallery } from "../../types";

// Prevent static generation - this page uses client hooks and dynamic routes
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

// List of filter route names that should not be treated as gallery IDs
const FILTER_ROUTES = [
  "wyslano",
  "wybrano",
  "prosba-o-zmiany",
  "gotowe-do-wysylki",
  "dostarczone",
  "robocze",
];

interface PaymentDetails {
  totalAmountCents: number;
  walletAmountCents: number;
  stripeAmountCents: number;
  balanceAfterPayment?: number;
}

interface PaymentDetectionResult {
  isWalletTopUp: boolean;
  isGalleryPayment: boolean;
  publishParam: string | null;
  galleryIdParam: string | null;
}

/**
 * Detects the type of payment redirect from URL parameters
 */
function detectPaymentType(
  params: URLSearchParams,
  galleryId: string | string[] | undefined
): PaymentDetectionResult {
  const paymentSuccess = params.get("payment") === "success";
  const galleryParam = params.get("gallery");
  const publishParam = params.get("publish");
  const limitExceededParam = params.get("limitExceeded");
  const galleryIdParam = params.get("galleryId");
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;

  const isGalleryPayment = paymentSuccess && galleryParam === galleryIdStr;
  const isWalletTopUp =
    paymentSuccess &&
    galleryParam !== galleryIdStr && // Not a gallery payment
    (galleryIdParam === galleryIdStr || publishParam === "true" || limitExceededParam === "true"); // Has wallet top-up context params (publish or upgrade)

  return {
    isWalletTopUp,
    isGalleryPayment,
    publishParam,
    galleryIdParam,
  };
}

/**
 * Cleans URL parameters, preserving specific params for publish wizard or upgrade wizard
 */
function cleanUrlParams(preserveParams: {
  publish?: string | null;
  galleryId?: string | null;
  limitExceeded?: string | null;
  duration?: string | null;
  planKey?: string | null;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const newParams = new URLSearchParams();
  if (preserveParams.publish === "true") {
    newParams.set("publish", preserveParams.publish);
  }
  if (preserveParams.limitExceeded === "true") {
    newParams.set("limitExceeded", preserveParams.limitExceeded);
  }
  if (preserveParams.galleryId) {
    newParams.set("galleryId", preserveParams.galleryId);
  }
  if (preserveParams.duration) {
    newParams.set("duration", preserveParams.duration);
  }
  if (preserveParams.planKey) {
    newParams.set("planKey", preserveParams.planKey);
  }

  const newParamsStr = newParams.toString();
  const newUrl = newParamsStr
    ? `${window.location.pathname}?${newParamsStr}`
    : window.location.pathname;
  window.history.replaceState({}, "", newUrl);
}

/**
 * Handles wallet top-up success: refreshes balance, reloads orders, shows toast
 */
async function handleWalletTopUpSuccess(
  _galleryIdStr: string,
  loadOrders: () => Promise<void>,
  showToast: (type: "success" | "error", title: string, message: string) => void,
  preserveParams: {
    publish?: string | null;
    galleryId?: string | null;
    limitExceeded?: string | null;
    duration?: string | null;
    planKey?: string | null;
  }
): Promise<void> {
  showToast("success", "Sukces", "Portfel został doładowany pomyślnie!");

  // Reload gallery orders
  await loadOrders();

  // Clean URL params but preserve publish/galleryId/limitExceeded/duration/planKey if present
  cleanUrlParams(preserveParams);

  // Note: Wallet balance is only refreshed on wallet page and publish wizard
}

/**
 * Polls for gallery payment status and reloads data when confirmed
 */
async function pollGalleryPaymentStatus(
  _galleryIdStr: string,
  initialGalleryState: string | undefined,
  reloadGallery: (() => Promise<Gallery | null | undefined>) | undefined,
  loadOrders: () => Promise<void>,
  showToast: (type: "success" | "error", title: string, message: string) => void
): Promise<void> {
  let pollAttempts = 0;
  const maxPollAttempts = 10; // Poll for up to 10 seconds
  const pollInterval = 1000; // 1 second

  const poll = async (): Promise<void> => {
    try {
      // Reload gallery to check payment status
      const updatedGallery = reloadGallery ? await reloadGallery() : null;

      // Check if gallery state changed from DRAFT to PAID_ACTIVE
      if (updatedGallery?.state === "PAID_ACTIVE" && initialGalleryState === "DRAFT") {
        // Payment confirmed! Stop polling
        await loadOrders();
        showToast("success", "Sukces", "Płatność zakończona pomyślnie!");
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      pollAttempts++;

      // If we've polled enough times, stop polling and do final reload
      if (pollAttempts >= maxPollAttempts) {
        // Final reload
        if (reloadGallery) {
          await reloadGallery();
        }
        return;
        await loadOrders();
        showToast("success", "Sukces", "Płatność zakończona pomyślnie!");
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        // Continue polling
        setTimeout(poll, pollInterval);
      }
    } catch (error) {
      // On error, just reload once and stop polling
      if (reloadGallery) {
        await reloadGallery();
      }
      await loadOrders();
      window.history.replaceState({}, "", window.location.pathname);
    }
  };

  // Start polling immediately
  await poll();
}

/**
 * Handles gallery payment success: polls for status, reloads data, shows toast
 */
async function handleGalleryPaymentSuccess(
  galleryIdStr: string,
  gallery: Gallery,
  reloadGallery: (() => Promise<Gallery | null | undefined>) | undefined,
  loadOrders: () => Promise<void>,
  showToast: (type: "success" | "error", title: string, message: string) => void
): Promise<void> {
  showToast("success", "Sukces", "Płatność zakończona pomyślnie! Weryfikowanie statusu...");

  const initialGalleryState = gallery.state;

  // Poll for payment status (fallback if webhook is slow)
  await pollGalleryPaymentStatus(
    galleryIdStr,
    initialGalleryState,
    reloadGallery,
    loadOrders,
    showToast
  );
}

export default function GalleryDetail() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { logDataLoad, logDataLoaded, logDataError, logUserAction } = usePageLogger({
    pageName: "GalleryDetail",
  });
  // Use React Query hook for gallery data
  const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const {
    data: gallery,
    isLoading: galleryLoading,
    refetch: refetchGallery,
  } = useGallery(galleryIdForQuery);
  const reloadGallery = useCallback(async (): Promise<Gallery | null | undefined> => {
    if (galleryIdStr) {
      const result = await refetchGallery();
      return result.data ?? null;
    }
    return null;
  }, [galleryIdStr, refetchGallery]);
  const { isNonSelectionGallery } = useGalleryType();

  const [showSendLinkModal, setShowSendLinkModal] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [walletBalance, _setWalletBalance] = useState<number>(0);
  const [denyModalOpen, setDenyModalOpen] = useState<boolean>(false);
  const [denyOrderId, setDenyOrderId] = useState<string | null>(null);
  const [isRedirectingToOrder, setIsRedirectingToOrder] = useState<boolean>(false);

  // Mutations
  const payGalleryMutation = usePayGallery();
  const approveChangeRequestMutation = useApproveChangeRequest();
  const denyChangeRequestMutation = useDenyChangeRequest();
  const sendGalleryToClientMutation = useSendGalleryToClient();
  const [paymentDetails, _setPaymentDetails] = useState<PaymentDetails>({
    totalAmountCents: 0,
    walletAmountCents: 0,
    stripeAmountCents: 0,
  });

  // Check if we're coming from gallery creation - show loading overlay until fully loaded
  // Move hooks before conditional return to avoid React Hooks rules violation
  const galleryCreationLoading = useGalleryCreationLoading();

  // Clear gallery creation flow state when gallery detail page is ready
  const galleryCreationFlowActive = useUnifiedStore((state) => state.galleryCreationFlowActive);
  const galleryCreationTargetId = useUnifiedStore((state) => state.galleryCreationTargetId);
  const setGalleryCreationFlowActive = useUnifiedStore(
    (state) => state.setGalleryCreationFlowActive
  );

  const {
    data: orders = [],
    isLoading: orderLoading,
    refetch: refetchOrders,
  } = useOrders(galleryIdForQuery);

  const loadOrders = async (): Promise<void> => {
    if (!galleryIdForQuery) {
      return;
    }

    logDataLoad("orders", { galleryId: galleryIdForQuery });

    try {
      const result = await refetchOrders();
      const loadedOrders = result.data ?? [];
      logDataLoaded("orders", loadedOrders, {
        count: loadedOrders.length,
        galleryId: galleryIdForQuery,
      });
    } catch (err) {
      logDataError("orders", err);
      // Check if error is 404 (gallery not found/deleted) - handle silently
      const apiError = err as { status?: number };
      if (apiError.status === 404) {
        // Gallery doesn't exist (deleted) - silently continue
        return;
      }

      // For other errors, show toast
      // eslint-disable-next-line no-console

      showToast("error", "Błąd", formatApiError(err) ?? "Nie udało się załadować zleceń");
    }
  };

  // Don't render gallery detail if this is a filter route - let Next.js handle static routes
  // Check this AFTER hooks to avoid conditional hook call
  const isFilterRoute = router.isReady && galleryId && FILTER_ROUTES.includes(String(galleryId));

  useEffect(() => {
    // Store referrer when entering gallery view (if not already stored)
    if (typeof window !== "undefined" && galleryId && router.isReady) {
      const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
      const referrerKey = `gallery_referrer_${galleryIdStr}`;
      const referrerPath = sessionStorage.getItem(referrerKey);

      // Only store if we don't have a referrer yet
      if (!referrerPath) {
        // Try to get referrer from document.referrer
        let referrer: string | null = null;
        if (document.referrer) {
          try {
            const referrerUrl = new URL(document.referrer);
            const referrerPathname = referrerUrl.pathname;
            // Only use if it's from our domain and not a gallery detail page
            if (
              referrerUrl.origin === window.location.origin &&
              !referrerPathname.includes(`/galleries/${galleryIdStr}`) &&
              referrerPathname !== router.asPath
            ) {
              referrer = referrerPathname;
            }
          } catch (_e) {
            // Invalid URL, ignore
          }
        }

        // Default to dashboard if no valid referrer found
        sessionStorage.setItem(referrerKey, referrer ?? "/");
      }
    }

    // Auth is handled by AuthProvider/ProtectedRoute - just load data
    if (galleryIdForQuery) {
      // Let React Query's cache and staleTime handle freshness automatically
      // With refetchOnMount: "stale", queries will only refetch if data is actually stale
      // This prevents unnecessary refetches when data is still fresh (< 2 min old)
      void loadOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, galleryIdForQuery, router.isReady, router.asPath, queryClient]);

  // Handle payment redirects (wallet top-up or gallery payment) and ensure orders are always loaded
  useEffect(() => {
    if (typeof window === "undefined" || !galleryId || !router.isReady) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const paymentDetection = detectPaymentType(params, galleryId);

    // Handle wallet top-up success (will load orders with fresh data)
    if (paymentDetection.isWalletTopUp) {
      void (async () => {
        const params = new URLSearchParams(window.location.search);
        await handleWalletTopUpSuccess(galleryIdStr, loadOrders, showToast, {
          publish: paymentDetection.publishParam,
          galleryId: paymentDetection.galleryIdParam,
          limitExceeded: params.get("limitExceeded"),
          duration: params.get("duration"),
          planKey: params.get("planKey"),
        });
      })();
      return;
    }

    // Handle gallery payment success (will load orders immediately and during polling)
    if (paymentDetection.isGalleryPayment && gallery) {
      // Load orders immediately to ensure they're available
      void loadOrders();
      // Start polling for payment status confirmation
      void handleGalleryPaymentSuccess(galleryIdStr, gallery, reloadGallery, loadOrders, showToast);
      return;
    }

    // Always ensure orders are loaded (regardless of payment status)
    // This ensures "Ukoncz Konfiguracje" overlay works correctly
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, router.isReady, router.asPath, gallery]);

  // Clear gallery creation flow when gallery detail page is fully ready
  useEffect(() => {
    // Only clear if flow is active and we're on the target gallery
    if (!galleryCreationFlowActive || !galleryIdStr || galleryCreationTargetId !== galleryIdStr) {
      return;
    }

    // Check if page is fully ready:
    // - Gallery is loaded (not loading)
    // - Router is ready
    const isPageReady = !!gallery && !galleryLoading && router.isReady;

    if (isPageReady) {
      // Clear the flow - overlay will disappear
      setGalleryCreationFlowActive(false);
    }
  }, [
    galleryCreationFlowActive,
    galleryCreationTargetId,
    galleryIdStr,
    gallery,
    galleryLoading,
    router.isReady,
    setGalleryCreationFlowActive,
  ]);

  // Clear flow if user navigates away from target gallery
  useEffect(() => {
    if (
      galleryCreationFlowActive &&
      galleryCreationTargetId &&
      galleryIdStr &&
      galleryCreationTargetId !== galleryIdStr
    ) {
      // User navigated to a different gallery - clear the flow
      setGalleryCreationFlowActive(false);
    }
  }, [
    galleryCreationFlowActive,
    galleryCreationTargetId,
    galleryIdStr,
    setGalleryCreationFlowActive,
  ]);

  // Clear flow on unmount if it's still active (safety cleanup)
  useEffect(() => {
    return () => {
      if (galleryCreationFlowActive && galleryCreationTargetId === galleryIdStr) {
        setGalleryCreationFlowActive(false);
      }
    };
  }, [
    galleryCreationFlowActive,
    galleryCreationTargetId,
    galleryIdStr,
    setGalleryCreationFlowActive,
  ]);

  // Redirect non-selection galleries to order view
  useEffect(() => {
    if (!galleryIdForQuery || !gallery || !isNonSelectionGallery || !router.isReady) {
      setIsRedirectingToOrder(false);
      return;
    }

    // Only redirect if we're on the gallery detail page (not already on order page)
    if (router.pathname === "/galleries/[id]" && !router.asPath.includes("/orders/")) {
      // Set redirecting state immediately to prevent rendering orders list
      setIsRedirectingToOrder(true);

      // Use orders from React Query
      if (orders.length > 0) {
        const firstOrder = orders[0];
        if (firstOrder?.orderId) {
          void router.replace(`/galleries/${galleryIdForQuery}/orders/${firstOrder.orderId}`);
        } else {
          setIsRedirectingToOrder(false);
        }
      } else {
        // If no orders in cache, refetch and redirect
        const redirectToOrder = async () => {
          try {
            const result = await refetchOrders();
            const fetchedOrders = result.data ?? [];
            if (fetchedOrders.length > 0) {
              const firstOrder = fetchedOrders[0];
              if (firstOrder?.orderId) {
                void router.replace(`/galleries/${galleryIdForQuery}/orders/${firstOrder.orderId}`);
              } else {
                setIsRedirectingToOrder(false);
              }
            } else {
              setIsRedirectingToOrder(false);
            }
          } catch (err) {
            setIsRedirectingToOrder(false);
          }
        };
        void redirectToOrder();
      }
    } else {
      setIsRedirectingToOrder(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    galleryIdForQuery,
    gallery,
    isNonSelectionGallery,
    router.isReady,
    router.pathname,
    router.asPath,
    orders,
    refetchOrders,
  ]);

  const handleApproveChangeRequest = async (orderId: string): Promise<void> => {
    if (!galleryId || !orderId) {
      return;
    }

    logUserAction("approveChangeRequest", { galleryId, orderId });
    try {
      await approveChangeRequestMutation.mutateAsync({ galleryId: galleryId as string, orderId });

      showToast(
        "success",
        "Sukces",
        "Prośba o zmiany została zatwierdzona. Klient może teraz modyfikować wybór."
      );
      await loadOrders();
    } catch (err) {
      showToast(
        "error",
        "Błąd",
        formatApiError(err) ?? "Nie udało się zatwierdzić prośby o zmiany"
      );
    }
  };

  const handleDenyChangeRequest = (orderId: string): void => {
    logUserAction("denyChangeRequest", { galleryId, orderId });
    setDenyOrderId(orderId);
    setDenyModalOpen(true);
  };

  const handleDenyConfirm = async (
    reason?: string,
    preventFutureChangeRequests?: boolean
  ): Promise<void> => {
    if (!galleryId || !denyOrderId) {
      return;
    }

    try {
      await denyChangeRequestMutation.mutateAsync({
        galleryId: galleryId as string,
        orderId: denyOrderId,
        reason: reason ?? "",
        preventFutureChangeRequests,
      });

      showToast(
        "success",
        "Sukces",
        "Prośba o zmiany została odrzucona. Zlecenie zostało przywrócone do poprzedniego statusu."
      );
      setDenyModalOpen(false);
      setDenyOrderId(null);
      await loadOrders();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) ?? "Nie udało się odrzucić prośby o zmiany");
    }
  };

  const handlePaymentConfirm = async (): Promise<void> => {
    if (!galleryId || !paymentDetails) {
      return;
    }

    setShowPaymentModal(false);

    try {
      // Backend will automatically use full Stripe if wallet is insufficient (no partial payments)
      // Call pay endpoint without dryRun to actually process payment
      const data = await payGalleryMutation.mutateAsync({
        galleryId: galleryId as string,
        options: {},
      });

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.paid) {
        showToast("success", "Sukces", "Galeria została opłacona z portfela!");
        // Reload gallery to get updated status
        if (galleryId && reloadGallery) {
          void reloadGallery();
        }
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się opłacić galerii");
    }
  };

  const handleSendLink = async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    // Check if this is a reminder (has existing orders) or initial invitation
    const isReminder = orders && orders.length > 0;

    try {
      const responseData = await sendGalleryToClientMutation.mutateAsync(galleryId as string);
      const isReminderResponse = responseData.isReminder ?? isReminder;

      showToast(
        "success",
        "Sukces",
        isReminderResponse
          ? "Przypomnienie z linkiem do galerii zostało wysłane do klienta"
          : "Link do galerii został wysłany do klienta"
      );
      setShowSendLinkModal(false);

      // Reload orders (only creates order if no orders exist)
      await loadOrders();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  };

  type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";

  const getDeliveryStatusBadge = (status?: string) => {
    const statusMap: Record<string, { color: BadgeColor; label: string }> = {
      CLIENT_SELECTING: { color: "info", label: "Wybór przez klienta" },
      CLIENT_APPROVED: { color: "success", label: "Zatwierdzone" },
      AWAITING_FINAL_PHOTOS: { color: "warning", label: "Oczekuje na finały" },
      CHANGES_REQUESTED: { color: "warning", label: "Prośba o zmiany" },
      PREPARING_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
      DELIVERED: { color: "success", label: "Dostarczone" },
      CANCELLED: { color: "error", label: "Anulowane" },
    };

    const statusInfo = statusMap[status ?? ""] ?? {
      color: "light" as BadgeColor,
      label: status ?? "",
    };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  const getPaymentStatusBadge = (status?: string) => {
    const statusMap: Record<string, { color: BadgeColor; label: string }> = {
      UNPAID: { color: "error", label: "Nieopłacone" },
      PARTIALLY_PAID: { color: "warning", label: "Częściowo opłacone" },
      PAID: { color: "success", label: "Opłacone" },
      REFUNDED: { color: "error", label: "Zwrócone" },
    };

    const statusInfo = statusMap[status ?? ""] ?? {
      color: "light" as BadgeColor,
      label: status ?? "",
    };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  // Loading state is now automatically managed by React Query mutations
  // No need to manually set/unset loading state

  // Don't render gallery detail if this is a filter route - let Next.js handle static routes
  // Check this AFTER hooks to avoid conditional hook call
  if (isFilterRoute) {
    return null;
  }

  // Gallery data comes from GalleryContext (provided by GalleryLayoutWrapper)
  // Show loading only for orders, not gallery (gallery loading is handled by wrapper)
  if (galleryLoading || galleryCreationLoading) {
    return (
      <FullPageLoading
        text={galleryCreationLoading ? "Tworzenie galerii..." : "Ładowanie zleceń..."}
      />
    );
  }

  if (!gallery) {
    return null; // Error is handled by GalleryLayoutWrapper
  }

  // For non-selection galleries, check if we need to redirect to order view
  // This prevents flashing the orders list before redirect
  const shouldRedirectToOrder =
    isNonSelectionGallery &&
    router.isReady &&
    router.pathname === "/galleries/[id]" &&
    !router.asPath.includes("/orders/");

  // If we're redirecting to order view for non-selection gallery, show loading instead of orders list
  if (shouldRedirectToOrder && isNonSelectionGallery) {
    // If we have orders available, show loading while redirect happens (useEffect will handle redirect)
    if (orders.length > 0 && orders[0]?.orderId) {
      return (
        <>
          <NextStepsOverlay />
          <FullPageLoading text="Przekierowywanie..." />
        </>
      );
    }
    // If we're waiting for orders to load, show loading
    if (orderLoading || isRedirectingToOrder) {
      return (
        <>
          <NextStepsOverlay />
          <FullPageLoading text="Przekierowywanie..." />
        </>
      );
    }
    // If orders failed to load or are empty, fall through to show empty state
  }

  return (
    <>
      {/* Next Steps Overlay */}
      <NextStepsOverlay />

      {/* Main Content - Orders */}
      <div>
        <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Zlecenia</h2>
            {!orderLoading && (
              <Badge color="info" variant="light">
                {orders.length} {orders.length === 1 ? "zlecenie" : "zleceń"}
              </Badge>
            )}
          </div>

          {orderLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500 dark:text-gray-400">Ładowanie zleceń...</div>
            </div>
          ) : orders.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">Brak zleceń dla tej galerii</p>
          ) : (
            <div className="w-full">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-100 dark:bg-gray-900">
                    <TableCell
                      isHeader
                      className="px-3 py-3 h-[68px] text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Numer
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-3 py-3 h-[68px] text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Status dostawy
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-3 py-3 h-[68px] text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Status płatności
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-3 py-3 h-[68px] text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Kwota
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-3 py-3 h-[68px] text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Data utworzenia
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-3 py-3 h-[68px] text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Akcje
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order, index) => {
                    const isEvenRow = index % 2 === 0;
                    return (
                      <TableRow
                        key={order.orderId}
                        className={`h-[120px] ${
                          isEvenRow
                            ? "bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/90"
                            : "bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-800/40"
                        }`}
                      >
                        <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                          #{formatOrderDisplay(order)}
                        </TableCell>
                        <TableCell className="px-3 py-5 align-middle">
                          {getDeliveryStatusBadge(
                            typeof order.deliveryStatus === "string"
                              ? order.deliveryStatus
                              : undefined
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-5 align-middle">
                          {getPaymentStatusBadge(order.paymentStatus)}
                        </TableCell>
                        <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                          {formatPrice(
                            typeof order.totalCents === "number" ? order.totalCents : null
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-5 text-base text-gray-500 dark:text-gray-400 align-middle">
                          {order.createdAt
                            ? new Date(
                                order.createdAt as string | number | Date
                              ).toLocaleDateString("pl-PL")
                            : "-"}
                        </TableCell>
                        <TableCell className="px-3 py-5 align-middle">
                          <div className="flex items-center gap-2">
                            {order.deliveryStatus === "CHANGES_REQUESTED" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleApproveChangeRequest(order.orderId)}
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                  Zatwierdź
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDenyChangeRequest(order.orderId)}
                                  className="!text-orange-500 hover:!text-orange-600 hover:bg-orange-50 dark:!text-orange-400 dark:hover:!text-orange-300 dark:hover:bg-orange-500/10 !ring-orange-500 dark:!ring-orange-400"
                                >
                                  Odrzuć
                                </Button>
                              </>
                            )}
                            <Link href={`/galleries/${galleryIdStr}/orders/${order.orderId}`}>
                              <Button size="sm" variant="outline">
                                Szczegóły
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Send Link Modal */}
      <Modal isOpen={showSendLinkModal} onClose={() => setShowSendLinkModal(false)}>
        <div className="p-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Wyślij link do klienta
          </h2>

          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Link do galerii zostanie wysłany na adres:{" "}
            <strong>{typeof gallery.clientEmail === "string" ? gallery.clientEmail : ""}</strong>
          </p>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowSendLinkModal(false)}>
              Anuluj
            </Button>
            <Button variant="primary" onClick={handleSendLink}>
              Wyślij
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deny Change Request Modal */}
      <DenyChangeRequestModal
        isOpen={denyModalOpen}
        onClose={() => {
          setDenyModalOpen(false);
          setDenyOrderId(null);
        }}
        onConfirm={handleDenyConfirm}
        loading={denyChangeRequestMutation.isPending}
      />

      {/* Payment Confirmation Modal */}
      <PaymentConfirmationModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
        }}
        onConfirm={handlePaymentConfirm}
        totalAmountCents={paymentDetails.totalAmountCents}
        walletBalanceCents={walletBalance}
        walletAmountCents={paymentDetails.walletAmountCents}
        stripeAmountCents={paymentDetails.stripeAmountCents}
        loading={payGalleryMutation.isPending}
      />
    </>
  );
}
