import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Badge from "../ui/badge/Badge";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import { Loading } from "../ui/loading/Loading";
import { apiFetch, formatApiError } from "../../lib/api";
import { getIdToken } from "../../lib/auth";
import Link from "next/link";

interface OrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  excludeDeliveryStatus?: string; // For filtering (e.g., "DELIVERED" for active orders)
}

export const OrdersModal: React.FC<OrdersModalProps> = ({
  isOpen,
  onClose,
  title,
  excludeDeliveryStatus,
}) => {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const itemsPerPage = 20;

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    const token = getIdToken();
    if (token) {
      setIdToken(token);
    }
  }, []);

  useEffect(() => {
    if (isOpen && apiUrl && idToken) {
      loadOrders();
    }
  }, [isOpen, apiUrl, idToken, page, excludeDeliveryStatus]);

  const loadOrders = async () => {
    if (!apiUrl || !idToken) return;

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

      let allOrders = [];
      if (Array.isArray(ordersData)) {
        allOrders = ordersData;
      } else if (ordersData && Array.isArray(ordersData.items)) {
        allOrders = ordersData.items;
        setTotalPages(ordersData.totalPages || 1);
        setHasNextPage(ordersData.hasNextPage || false);
        setHasPreviousPage(ordersData.hasPreviousPage || false);
      } else {
        console.warn("Unexpected orders response structure:", ordersData);
        setError("Nieprawidłowy format odpowiedzi z API");
        return;
      }

      setOrders(allOrders);
    } catch (err) {
      console.error("Error loading orders:", err);
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const getDeliveryStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: any; label: string }> = {
      CLIENT_SELECTING: { color: "info", label: "Wybór przez klienta" },
      CLIENT_APPROVED: { color: "success", label: "Zatwierdzone" },
      AWAITING_FINAL_PHOTOS: { color: "warning", label: "Oczekuje na finały" },
      CHANGES_REQUESTED: { color: "warning", label: "Prośba o zmiany" },
      PREPARING_FOR_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
      DELIVERED: { color: "success", label: "Dostarczone" },
      CANCELLED: { color: "error", label: "Anulowane" },
    };

    const statusInfo = statusMap[status] || { color: "light", label: status };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  const getPaymentStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: any; label: string }> = {
      UNPAID: { color: "error", label: "Nieopłacone" },
      PARTIALLY_PAID: { color: "warning", label: "Częściowo opłacone" },
      PAID: { color: "success", label: "Opłacone" },
      REFUNDED: { color: "error", label: "Zwrócone" },
    };

    const statusInfo = statusMap[status] || { color: "light", label: status };
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
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
      <div className="p-6 flex-1 overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          {title}
        </h2>

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
            <p className="text-gray-500 dark:text-gray-400">
              Brak zleceń
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto mb-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Galeria
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Zlecenie
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Status dostawy
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Status płatności
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Kwota
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Data utworzenia
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
                        {((order.totalCents || 0) / 100).toFixed(2)} PLN
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString("pl-PL")
                          : "-"}
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
    </Modal>
  );
};

