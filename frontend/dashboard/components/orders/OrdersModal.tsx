import Link from "next/link";
import { useState, useEffect } from "react";

import { apiFetch, formatApiError } from "../../lib/api";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { formatPrice } from "../../lib/format-price";
import Badge from "../ui/badge/Badge";
import Button from "../ui/button/Button";
import { Loading } from "../ui/loading/Loading";
import { Modal } from "../ui/modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";

import { DenyChangeRequestModal } from "./DenyChangeRequestModal";

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  excludeDeliveryStatus?: string; // For filtering (e.g., "DELIVERED" for active orders)
}

interface Order {
  orderId?: string;
  galleryId?: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  totalCents?: number;
  createdAt?: string | number | Date;
  [key: string]: unknown;
}

type BadgeColor = "info" | "success" | "error" | "warning" | "light";

export const OrdersModal: React.FC<OrdersModalProps> = ({
  isOpen,
  onClose,
  title,
  excludeDeliveryStatus,
}) => {
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const itemsPerPage = 20;
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyLoading, setDenyLoading] = useState(false);
  const [denyGalleryId, setDenyGalleryId] = useState<string | null>(null);
  const [denyOrderId, setDenyOrderId] = useState<string | null>(null);

  const loadOrders = async () => {
    if (!apiUrl || !idToken) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      let url = `${apiUrl}/orders?page=${page}&itemsPerPage=${itemsPerPage}`;
      if (excludeDeliveryStatus) {
        url += `&excludeDeliveryStatus=${excludeDeliveryStatus}`;
      }

      const { data: ordersData } = await apiFetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      interface OrdersResponse {
        items?: Order[];
        totalPages?: number;
        hasNextPage?: boolean;
        hasPreviousPage?: boolean;
      }
      let allOrders: Order[] = [];
      if (Array.isArray(ordersData)) {
        allOrders = ordersData as Order[];
      } else {
        const typedData = ordersData as OrdersResponse;
        if (typedData && Array.isArray(typedData.items)) {
          allOrders = typedData.items;
          setTotalPages(typedData.totalPages ?? 1);
          setHasNextPage(typedData.hasNextPage ?? false);
          setHasPreviousPage(typedData.hasPreviousPage ?? false);
        } else {
          setError("Nieprawidłowy format odpowiedzi z API");
          return;
        }
      }

      setOrders(allOrders);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL ?? "");
    initializeAuth(
      (token) => {
        setIdToken(token);
      },
      () => {
        redirectToLandingSignIn(typeof window !== "undefined" ? window.location.pathname : "/");
      }
    );
  }, []);

  useEffect(() => {
    if (isOpen && apiUrl && idToken) {
      void loadOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, apiUrl, idToken, page, excludeDeliveryStatus]);

  const getDeliveryStatusBadge = (status: string) => {
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

    const statusInfo = statusMap[status] ?? { color: "light" as BadgeColor, label: status };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  const getPaymentStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: BadgeColor; label: string }> = {
      UNPAID: { color: "error", label: "Nieopłacone" },
      PARTIALLY_PAID: { color: "warning", label: "Częściowo opłacone" },
      PAID: { color: "success", label: "Opłacone" },
      REFUNDED: { color: "error", label: "Zwrócone" },
    };

    const statusInfo = statusMap[status] ?? { color: "light" as BadgeColor, label: status };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  const handlePreviousPage = () => {
    if (hasPreviousPage) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    if (hasNextPage) {
      setPage(page + 1);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <div className="p-6 flex-1 overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{title}</h2>

        {error && (
          <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-500/10 dark:border-error-500/20 dark:text-error-400 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loading size="lg" text="Ładowanie zleceń..." />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-gray-500 dark:text-gray-400">Brak zleceń</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto mb-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Galeria
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Zlecenie
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
                      key={`${order.galleryId}-${order.orderId}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <Link
                          href={`/galleries/${order.galleryId}`}
                          className="text-brand-500 hover:text-brand-600"
                          onClick={() => {
                            onClose();
                            if (typeof window !== "undefined") {
                              const referrerKey = `gallery_referrer_${order.galleryId}`;
                              sessionStorage.setItem(referrerKey, window.location.pathname);
                            }
                          }}
                        >
                          {order.galleryName}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <Link
                          href={`/galleries/${order.galleryId}/orders/${order.orderId}`}
                          className="text-brand-500 hover:text-brand-600"
                          onClick={onClose}
                        >
                          #{order.orderNumber}
                        </Link>
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
                      <TableCell className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          {order.deliveryStatus === "CHANGES_REQUESTED" && (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={async () => {
                                  try {
                                    await apiFetch(
                                      `${apiUrl}/galleries/${order.galleryId}/orders/${order.orderId}/approve-change`,
                                      {
                                        method: "POST",
                                        headers: { Authorization: `Bearer ${idToken}` },
                                      }
                                    );
                                    await loadOrders();
                                  } catch (err) {
                                    setError(formatApiError(err));
                                  }
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                Zatwierdź
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setDenyGalleryId(order.galleryId);
                                  setDenyOrderId(order.orderId);
                                  setDenyModalOpen(true);
                                }}
                              >
                                Odrzuć
                              </Button>
                            </>
                          )}
                          <Link href={`/galleries/${order.galleryId}/orders/${order.orderId}`}>
                            <Button variant="outline" size="sm" onClick={onClose}>
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

            {/* Pagination */}
            {(hasPreviousPage || hasNextPage) && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={!hasPreviousPage || loading}
                >
                  Poprzednia
                </Button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Strona {page} z {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!hasNextPage || loading}
                >
                  Następna
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Deny Change Request Modal */}
      <DenyChangeRequestModal
        isOpen={denyModalOpen}
        onClose={() => {
          setDenyModalOpen(false);
          setDenyGalleryId(null);
          setDenyOrderId(null);
        }}
        onConfirm={async (reason?: string) => {
          if (!apiUrl || !idToken || !denyGalleryId || !denyOrderId) {
            return;
          }

          setDenyLoading(true);

          try {
            await apiFetch(
              `${apiUrl}/galleries/${denyGalleryId}/orders/${denyOrderId}/deny-change`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${idToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ reason: reason ?? undefined }),
              }
            );
            setDenyModalOpen(false);
            setDenyGalleryId(null);
            setDenyOrderId(null);
            await loadOrders();
          } catch (err) {
            setError(formatApiError(err));
          } finally {
            setDenyLoading(false);
          }
        }}
        loading={denyLoading}
      />
    </Modal>
  );
};
