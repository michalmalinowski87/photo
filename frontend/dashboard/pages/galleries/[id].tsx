import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";

import { NextStepsOverlay } from "../../components/galleries/NextStepsOverlay";
import PaymentConfirmationModal from "../../components/galleries/PaymentConfirmationModal";
import { DenyChangeRequestModal } from "../../components/orders/DenyChangeRequestModal";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import { FullPageLoading } from "../../components/ui/loading/Loading";
import { Modal } from "../../components/ui/modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../../components/ui/table";
import { useGallery } from "../../hooks/useGallery";
import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { formatPrice } from "../../lib/format-price";
import { useGalleryStore } from "../../store/gallerySlice";

// List of filter route names that should not be treated as gallery IDs
const FILTER_ROUTES = [
  "wyslano",
  "wybrano",
  "prosba-o-zmiany",
  "gotowe-do-wysylki",
  "dostarczone",
  "robocze",
];

interface Order {
  orderId: string;
  orderNumber?: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  totalCents?: number;
  createdAt?: string;
  [key: string]: unknown;
}

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

interface GalleryOrdersUpdateEvent extends CustomEvent<{ galleryId?: string }> {
  detail: {
    galleryId?: string;
  };
}

export default function GalleryDetail() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const { showToast } = useToast();
  const galleryContext = useGallery();
  const gallery = galleryContext.gallery as Gallery | null;
  const galleryLoading = galleryContext.loading;
  const reloadGallery = galleryContext.reloadGallery;
  const { fetchGalleryOrders, fetchGallery } = useGalleryStore();

  const [loading, setLoading] = useState<boolean>(true); // Start with true to prevent flicker
  const [orders, setOrders] = useState<Order[]>([]);
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

    setLoading(true);

    try {
      // Use store action - checks cache first, fetches if needed
      const orders = await fetchGalleryOrders(galleryId as string);
      setOrders(orders);
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) ?? "Nie udało się załadować zleceń");
    } finally {
      setLoading(false);
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

    initializeAuth(
      () => {
        if (galleryId) {
          void loadOrders();
        }
      },
      () => {
        const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
        redirectToLandingSignIn(`/galleries/${galleryIdStr}`);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, router.isReady, router.asPath]);

  // UX IMPROVEMENT #1 & #3: Detect payment success after Stripe redirect, auto-refresh, and poll for payment status
  useEffect(() => {
    if (typeof window !== "undefined" && galleryId && router.isReady && gallery) {
      const params = new URLSearchParams(window.location.search);
      const paymentSuccess = params.get("payment") === "success";
      const galleryParam = params.get("gallery");

      if (paymentSuccess && galleryParam === galleryId) {
        // Show success toast
        showToast("success", "Sukces", "Płatność zakończona pomyślnie! Weryfikowanie statusu...");

        // UX IMPROVEMENT #3: Poll for payment status (fallback if webhook is slow)
        let pollAttempts = 0;
        const maxPollAttempts = 10; // Poll for up to 10 seconds
        const pollInterval = 1000; // 1 second
        const initialGalleryState = gallery.state; // Store initial state to detect change

        const pollPaymentStatus = async () => {
          try {
            // Reload gallery from store (checks cache, fetches if needed)
            try {
              const updatedGallery = await fetchGallery(galleryIdStr, true); // Force refresh

              // Check if gallery state changed from DRAFT to PAID_ACTIVE
              if (updatedGallery.state === "PAID_ACTIVE" && initialGalleryState === "DRAFT") {
                // Payment confirmed! Stop polling
                if (reloadGallery) {
                  void reloadGallery();
                }
                void loadOrders();
                showToast("success", "Sukces", "Płatność zakończona pomyślnie!");
                window.history.replaceState({}, "", window.location.pathname);
                return;
              }
            } catch (apiError) {
              console.error("Error fetching gallery status:", apiError);
            }

            pollAttempts++;

            // If we've polled enough times, stop polling and do final reload
            if (pollAttempts >= maxPollAttempts) {
              // Final reload
              if (reloadGallery) {
                void reloadGallery();
              }
              void loadOrders();
              showToast("success", "Sukces", "Płatność zakończona pomyślnie!");
              window.history.replaceState({}, "", window.location.pathname);
            } else {
              // Continue polling
              setTimeout(pollPaymentStatus, pollInterval);
            }
          } catch (error) {
            console.error("Error polling payment status:", error);
            // On error, just reload once and stop polling
            if (reloadGallery) {
              void reloadGallery();
            }
            void loadOrders();
            window.history.replaceState({}, "", window.location.pathname);
          }
        };

        // Start polling immediately
        void pollPaymentStatus();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, router.isReady, router.query, gallery]);

  // Listen for gallery orders update event (e.g., after sending link from sidebar)
  useEffect(() => {
    if (!galleryId) {
      return undefined;
    }

    const handleGalleryOrdersUpdate = (event: Event) => {
      const customEvent = event as GalleryOrdersUpdateEvent;
      // Only reload if this is the same gallery
      if (customEvent.detail?.galleryId === galleryId) {
        void loadOrders();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("galleryOrdersUpdated", handleGalleryOrdersUpdate);
      return () => {
        window.removeEventListener("galleryOrdersUpdated", handleGalleryOrdersUpdate);
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]);

  const handleApproveChangeRequest = async (orderId: string): Promise<void> => {
    if (!galleryId || !orderId) {
      return;
    }

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
        // Gallery data will be reloaded by GalleryLayoutWrapper
        // Wallet balance will be reloaded by parent component
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

  // Gallery data comes from GalleryContext (provided by GalleryLayoutWrapper)
  // Show loading only for orders, not gallery (gallery loading is handled by wrapper)
  if (galleryLoading) {
    return <FullPageLoading text="Ładowanie zleceń..." />;
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
            {!loading && (
              <Badge color="info" variant="light">
                {orders.length} {orders.length === 1 ? "zlecenie" : "zleceń"}
              </Badge>
            )}
          </div>

          {loading ? (
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
        <div className="p-6">
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
