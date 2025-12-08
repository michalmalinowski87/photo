import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  useApproveChangeRequest,
  useDenyChangeRequest,
} from "../../hooks/mutations/useOrderMutations";
import api from "../../lib/api-service";
import { formatPrice } from "../../lib/format-price";
import { queryKeys } from "../../lib/react-query";
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
  galleryName?: string;
  orderNumber?: string;
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
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyGalleryId, setDenyGalleryId] = useState<string | null>(null);
  const [denyOrderId, setDenyOrderId] = useState<string | null>(null);

  // Mutations
  const approveChangeRequestMutation = useApproveChangeRequest();
  const denyChangeRequestMutation = useDenyChangeRequest();

  // React Query hook with custom params for modal
  // Using queryKeys factory for proper cache management
  const {
    data: ordersData,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...queryKeys.orders.lists(), "modal", page, itemsPerPage, excludeDeliveryStatus],
    queryFn: async () => {
      const params: Record<string, string> = {
        page: page.toString(),
        itemsPerPage: itemsPerPage.toString(),
      };
      if (excludeDeliveryStatus) {
        params.excludeDeliveryStatus = excludeDeliveryStatus;
      }
      return await api.orders.list(params);
    },
    enabled: isOpen,
    staleTime: 30 * 1000,
  });

  interface OrdersResponse {
    items?: Order[];
    totalPages?: number;
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
  }

  const typedData = ordersData as OrdersResponse | Order[] | undefined;
  const orders: Order[] = Array.isArray(typedData) ? typedData : (typedData?.items ?? []);
  const totalPages = Array.isArray(typedData) ? 1 : (typedData?.totalPages ?? 1);
  const hasNextPage = Array.isArray(typedData) ? false : (typedData?.hasNextPage ?? false);
  const hasPreviousPage = Array.isArray(typedData) ? false : (typedData?.hasPreviousPage ?? false);

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
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            {error instanceof Error ? error.message : "Wystąpił błąd podczas ładowania danych"}
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
            <div className="w-full mb-4">
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
                          {typeof order.galleryName === "string" ? order.galleryName : ""}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <Link
                          href={`/galleries/${order.galleryId}/orders/${order.orderId}`}
                          className="text-brand-500 hover:text-brand-600"
                          onClick={onClose}
                        >
                          #{typeof order.orderNumber === "string" ? order.orderNumber : ""}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm whitespace-nowrap">
                        {getDeliveryStatusBadge(order.deliveryStatus ?? "")}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        {getPaymentStatusBadge(order.paymentStatus ?? "")}
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
                                  if (!order.galleryId || !order.orderId) {
                                    return;
                                  }
                                  try {
                                    await approveChangeRequestMutation.mutateAsync({
                                      galleryId: order.galleryId,
                                      orderId: order.orderId,
                                    });
                                    await refetch();
                                  } catch {
                                    // Error handled by React Query
                                  }
                                }}
                                disabled={approveChangeRequestMutation.isPending}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                {approveChangeRequestMutation.isPending
                                  ? "Zatwierdzanie..."
                                  : "Zatwierdź"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setDenyGalleryId(order.galleryId ?? null);
                                  setDenyOrderId(order.orderId ?? null);
                                  setDenyModalOpen(true);
                                }}
                              >
                                Odrzuć
                              </Button>
                            </>
                          )}
                          <Link href={`/galleries/${order.galleryId}/orders/${order.orderId}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={onClose}
                              className="max-[1350px]:px-0 max-[1350px]:w-auto max-[1350px]:h-auto max-[1350px]:bg-transparent max-[1350px]:border-0 max-[1350px]:ring-0 max-[1350px]:shadow-none hover:max-[1350px]:bg-transparent dark:max-[1350px]:bg-transparent dark:hover:max-[1350px]:bg-transparent"
                            >
                              <Eye className="w-4 h-4 hidden max-[1350px]:block" />
                              <span className="max-[1350px]:hidden">Szczegóły</span>
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
          if (!denyGalleryId || !denyOrderId) {
            return;
          }

          try {
            await denyChangeRequestMutation.mutateAsync({
              galleryId: denyGalleryId,
              orderId: denyOrderId,
              reason,
            });
            setDenyModalOpen(false);
            setDenyGalleryId(null);
            setDenyOrderId(null);
            await refetch();
          } catch {
            // Error handled by React Query
          }
        }}
        loading={denyChangeRequestMutation.isPending}
      />
    </Modal>
  );
};
