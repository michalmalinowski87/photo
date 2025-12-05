import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect, useRef } from "react";

import { NextStepsOverlay } from "../../components/galleries/NextStepsOverlay";
import PaymentConfirmationModal from "../../components/galleries/PaymentConfirmationModal";
import { useGalleryType } from "../../components/hocs/withGalleryType";
import { DenyChangeRequestModal } from "../../components/orders/DenyChangeRequestModal";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import { FullPageLoading } from "../../components/ui/loading/Loading";
import { Modal } from "../../components/ui/modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../../components/ui/table";
import { useGallery } from "../../hooks/useGallery";
import { usePageLogger } from "../../hooks/usePageLogger";
import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { formatPrice } from "../../lib/format-price";
import { useGalleryStore, useOrderStore, useUserStore } from "../../store";

// List of filter route names that should not be treated as gallery IDs
const FILTER_ROUTES = [
  "wyslano",
  "wybrano",
  "prosba-o-zmiany",
  "gotowe-do-wysylki",
  "dostarczone",
  "robocze",
];

interface Gallery {
  galleryId: string;
  state?: string;
  [key: string]: unknown;
}

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
  const galleryIdParam = params.get("galleryId");
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;

  const isGalleryPayment = paymentSuccess && galleryParam === galleryIdStr;
  const isWalletTopUp =
    paymentSuccess &&
    galleryParam !== galleryIdStr && // Not a gallery payment
    (galleryIdParam === galleryIdStr || publishParam === "true"); // Has wallet top-up context params

  return {
    isWalletTopUp,
    isGalleryPayment,
    publishParam,
    galleryIdParam,
  };
}

/**
 * Cleans URL parameters, preserving specific params for publish wizard
 */
function cleanUrlParams(preserveParams: {
  publish?: string | null;
  galleryId?: string | null;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const newParams = new URLSearchParams();
  if (preserveParams.publish === "true") {
    newParams.set("publish", preserveParams.publish);
  }
  if (preserveParams.galleryId) {
    newParams.set("galleryId", preserveParams.galleryId);
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
  galleryIdStr: string,
  loadOrders: () => Promise<void>,
  showToast: (type: "success" | "error", title: string, message: string) => void,
  preserveParams: { publish?: string | null; galleryId?: string | null }
): Promise<void> {
  showToast("success", "Sukces", "Portfel został doładowany pomyślnie!");

  // Reload gallery orders
  await loadOrders();

  // Clean URL params but preserve publish/galleryId if present
  cleanUrlParams(preserveParams);

  // Note: Wallet balance is only refreshed on wallet page and publish wizard
}

/**
 * Polls for gallery payment status and reloads data when confirmed
 */
async function pollGalleryPaymentStatus(
  galleryIdStr: string,
  initialGalleryState: string | undefined,
  reloadGallery: (() => Promise<void>) | undefined,
  loadOrders: () => Promise<void>,
  showToast: (type: "success" | "error", title: string, message: string) => void
): Promise<void> {
  let pollAttempts = 0;
  const maxPollAttempts = 10; // Poll for up to 10 seconds
  const pollInterval = 1000; // 1 second

  const poll = async (): Promise<void> => {
    try {
      // Reload gallery to check payment status
      if (reloadGallery) {
        await reloadGallery();
      }

      // Get updated gallery from store to check state
      const updatedGallery = useGalleryStore.getState().currentGallery;

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
        await loadOrders();
        showToast("success", "Sukces", "Płatność zakończona pomyślnie!");
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        // Continue polling
        setTimeout(poll, pollInterval);
      }
    } catch (error) {
      console.error("Error polling payment status:", error);
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
  reloadGallery: (() => Promise<void>) | undefined,
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
  const { showToast } = useToast();
  const { logDataLoad, logDataLoaded, logDataError, logUserAction } = usePageLogger({
    pageName: "GalleryDetail",
  });
  const galleryContext = useGallery();
  const gallery = galleryContext.gallery as Gallery | null;
  const galleryLoading = galleryContext.loading;
  const reloadGallery = galleryContext.reloadGallery;
  const { fetchGalleryOrders } = useGalleryStore();
  const { isNonSelectionGallery } = useGalleryType();

  // Use store state directly - no local state needed!
  const { getOrdersByGalleryId, isLoading: orderLoading } = useOrderStore();
  const orders = useOrderStore((_state) => {
    if (!galleryId) {
      return [];
    }
    return getOrdersByGalleryId(galleryId as string);
  });

  const [showSendLinkModal, setShowSendLinkModal] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [walletBalance, _setWalletBalance] = useState<number>(0);
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);
  const [denyModalOpen, setDenyModalOpen] = useState<boolean>(false);
  const [denyLoading, setDenyLoading] = useState<boolean>(false);
  const [denyOrderId, setDenyOrderId] = useState<string | null>(null);
  const [paymentDetails, _setPaymentDetails] = useState<PaymentDetails>({
    totalAmountCents: 0,
    walletAmountCents: 0,
    stripeAmountCents: 0,
  });

  const loadOrders = async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    const galleryIdStr = galleryId as string;
    logDataLoad("orders", { galleryId: galleryIdStr });

    try {
      const loadedOrders = await fetchGalleryOrders(galleryIdStr);
      logDataLoaded("orders", loadedOrders, {
        count: loadedOrders.length,
        galleryId: galleryIdStr,
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
      console.error("[GalleryDetail] loadOrders: Error", err);
      showToast("error", "Błąd", formatApiError(err) ?? "Nie udało się załadować zleceń");
    }
  };

  // Don't render gallery detail if this is a filter route - let Next.js handle static routes
  // Check this AFTER hooks to avoid conditional hook call
  const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
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
    if (galleryId) {
      void loadOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, router.isReady, router.asPath]);

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
        await handleWalletTopUpSuccess(galleryIdStr, loadOrders, showToast, {
          publish: paymentDetection.publishParam,
          galleryId: paymentDetection.galleryIdParam,
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

  // Redirect non-selection galleries to order view
  useEffect(() => {
    if (!galleryId || !gallery || !isNonSelectionGallery || !router.isReady) {
      return;
    }

    // Only redirect if we're on the gallery detail page (not already on order page)
    if (router.pathname === "/galleries/[id]" && !router.asPath.includes("/orders/")) {
      const redirectToOrder = async () => {
        try {
          const galleryIdStr = galleryId as string;
          const cachedOrders = getOrdersByGalleryId(galleryIdStr);
          if (cachedOrders && cachedOrders.length > 0 && cachedOrders[0]?.orderId) {
            void router.replace(`/galleries/${galleryIdStr}/orders/${cachedOrders[0].orderId}`);
          } else {
            const orders = await fetchGalleryOrders(galleryIdStr);
            if (orders && orders.length > 0 && orders[0]?.orderId) {
              void router.replace(`/galleries/${galleryIdStr}/orders/${orders[0].orderId}`);
            }
          }
        } catch (err) {
          console.error("Failed to fetch orders for redirect:", err);
        }
      };
      void redirectToOrder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    galleryId,
    gallery,
    isNonSelectionGallery,
    router.isReady,
    router.pathname,
    router.asPath,
    fetchGalleryOrders,
    getOrdersByGalleryId,
  ]);

  const handleApproveChangeRequest = async (orderId: string): Promise<void> => {
    if (!galleryId || !orderId) {
      return;
    }

    logUserAction("approveChangeRequest", { galleryId, orderId });
    try {
      await api.orders.approveChangeRequest(galleryId as string, orderId);

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

  const handleDenyConfirm = async (reason?: string): Promise<void> => {
    if (!galleryId || !denyOrderId) {
      return;
    }

    setDenyLoading(true);

    try {
      await api.orders.denyChangeRequest(galleryId as string, denyOrderId, reason ?? "");

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
    } finally {
      setDenyLoading(false);
    }
  };

  const handlePaymentConfirm = async (): Promise<void> => {
    if (!galleryId || !paymentDetails) {
      return;
    }

    setShowPaymentModal(false);
    setPaymentLoading(true);

    try {
      // Backend will automatically use full Stripe if wallet is insufficient (no partial payments)
      // Call pay endpoint without dryRun to actually process payment
      const data = await api.galleries.pay(galleryId as string, {});

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
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleSendLink = async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    // Check if this is a reminder (has existing orders) or initial invitation
    const isReminder = orders && orders.length > 0;

    try {
      const responseData = await api.galleries.sendToClient(galleryId as string);
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
      PREPARING_FOR_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
      PREPARING_DELIVERY: { color: "info", label: "Oczekuje do wysłania" },
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

  // Don't render gallery detail if this is a filter route - let Next.js handle static routes
  // Check this AFTER hooks to avoid conditional hook call
  if (isFilterRoute) {
    return null;
  }

  // Check if we're coming from gallery creation - show loading overlay until fully loaded
  const galleryCreationLoading = useGalleryStore((state) => state.galleryCreationLoading);
  const setGalleryCreationLoading = useGalleryStore((state) => state.setGalleryCreationLoading);

  // Hide creation loading when gallery is fully loaded and orders are loaded
  useEffect(() => {
    if (galleryCreationLoading && !galleryLoading && !orderLoading && gallery) {
      setGalleryCreationLoading(false);
    }
  }, [galleryCreationLoading, galleryLoading, orderLoading, gallery, setGalleryCreationLoading]);

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

  return (
    <>
      {/* Next Steps Overlay */}
      <NextStepsOverlay gallery={gallery} orders={orders} galleryLoading={galleryLoading} />

      {/* Main Content - Orders */}
      <div>
        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Numer
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Status dostawy
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Status płatności
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Kwota
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Data utworzenia
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Akcje
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow
                      key={order.orderId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        #{order.orderNumber ?? order.orderId.slice(-8)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        {getDeliveryStatusBadge(order.deliveryStatus)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        {getPaymentStatusBadge(order.paymentStatus)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {formatPrice(order.totalCents)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString("pl-PL")
                          : "-"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
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
                  ))}
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
        loading={denyLoading}
      />

      {/* Payment Confirmation Modal */}
      <PaymentConfirmationModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentLoading(false);
        }}
        onConfirm={handlePaymentConfirm}
        totalAmountCents={paymentDetails.totalAmountCents}
        walletBalanceCents={walletBalance}
        walletAmountCents={paymentDetails.walletAmountCents}
        stripeAmountCents={paymentDetails.stripeAmountCents}
        loading={paymentLoading}
      />
    </>
  );
}
