import { Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState } from "react";

import { formatPrice } from "../../lib/format-price";
import type { Order } from "../../types";
import Badge from "../ui/badge/Badge";
import Button from "../ui/button/Button";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";

type BadgeColor = "info" | "success" | "warning" | "error" | "light";

interface OrderWithGalleryInfo extends Order {
  galleryName?: string;
  gallerySelectionEnabled?: boolean;
  totalCents?: number;
}

interface ActiveOrdersTableProps {
  orders: OrderWithGalleryInfo[];
  onApproveChangeRequest?: (galleryId: string, orderId: string) => void;
  onDenyChangeRequest?: (galleryId: string, orderId: string) => void;
  onViewAllClick?: () => void;
}

const getDeliveryStatusBadge = (status: string, isNonSelectionGallery: boolean = false) => {
  const statusMap: Record<string, { color: BadgeColor; label: string }> = {
    CLIENT_SELECTING: { color: "info", label: "Wybór przez klienta" },
    CLIENT_APPROVED: { color: "success", label: "Zatwierdzone" },
    AWAITING_FINAL_PHOTOS: {
      color: "warning",
      label: isNonSelectionGallery ? "Oczekuje na zdjęcia" : "Oczekuje na finały",
    },
    CHANGES_REQUESTED: { color: "warning", label: "Prośba o zmiany" },
    PREPARING_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
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
  const statusMap: Record<string, { color: BadgeColor; label: string }> = {
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

export const ActiveOrdersTable: React.FC<ActiveOrdersTableProps> = ({
  orders,
  onApproveChangeRequest,
  onDenyChangeRequest,
  onViewAllClick,
}) => {
  const router = useRouter();
  const [navigatingGalleryId, setNavigatingGalleryId] = useState<string | null>(null);

  const handleGalleryClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    galleryId: string,
    orderId: string,
    isNonSelection: boolean
  ) => {
    e.preventDefault();

    setNavigatingGalleryId(galleryId);

    const handleNavigation = () => {
      setNavigatingGalleryId(null);
    };

    if (isNonSelection) {
      // For non-selection galleries, navigate to order view
      router
        .push(`/galleries/${galleryId}/orders/${orderId}`)
        .then(handleNavigation)
        .catch(handleNavigation);
    } else {
      // For selection galleries, navigate to gallery view
      // Store current page as referrer when navigating to gallery
      if (typeof window !== "undefined" && galleryId) {
        const referrerKey = `gallery_referrer_${galleryId}`;
        sessionStorage.setItem(referrerKey, window.location.pathname);
      }
      router.push(`/galleries/${galleryId}`).then(handleNavigation).catch(handleNavigation);
    }
  };

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Aktywne zlecenia</h2>
        {onViewAllClick && (
          <Button variant="outline" size="sm" onClick={onViewAllClick}>
            Zobacz wszystkie
          </Button>
        )}
      </div>

      {orders.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Brak aktywnych zleceń</p>
      ) : (
        <div className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100 dark:bg-gray-900">
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Galeria
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Zlecenie
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Status dostawy
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Status płatności
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Kwota
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Data utworzenia
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Akcje
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order, index) => {
                const orderObj: OrderWithGalleryInfo = order;
                const galleryId = typeof orderObj.galleryId === "string" ? orderObj.galleryId : "";
                const orderId = typeof orderObj.orderId === "string" ? orderObj.orderId : "";
                const galleryName =
                  typeof orderObj.galleryName === "string" ? orderObj.galleryName : "";
                const orderNumber =
                  typeof orderObj.orderNumber === "string" ||
                  typeof orderObj.orderNumber === "number"
                    ? String(orderObj.orderNumber)
                    : "";
                const deliveryStatus =
                  typeof orderObj.deliveryStatus === "string" ? orderObj.deliveryStatus : "";
                const paymentStatus =
                  typeof orderObj.paymentStatus === "string" ? orderObj.paymentStatus : "";
                const totalCents =
                  typeof orderObj.totalCents === "number" ? orderObj.totalCents : null;
                const createdAt = orderObj.createdAt;
                const isNonSelectionGallery = orderObj.gallerySelectionEnabled === false;
                const isEvenRow = index % 2 === 0;

                return (
                  <TableRow
                    key={`${galleryId}-${orderId}`}
                    className={`h-[120px] ${
                      isEvenRow
                        ? "bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/90"
                        : "bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-800/40"
                    }`}
                  >
                    <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                      <Link
                        href={`/galleries/${galleryId}`}
                        className="text-brand-500 hover:text-brand-600"
                        onClick={(e) => {
                          if (galleryId && orderId) {
                            handleGalleryClick(e, galleryId, orderId, isNonSelectionGallery);
                          }
                        }}
                      >
                        {galleryName}
                        {navigatingGalleryId === galleryId && (
                          <span className="ml-2 text-sm text-gray-400">...</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                      <Link
                        href={`/galleries/${galleryId}/orders/${orderId}`}
                        className="text-brand-500 hover:text-brand-600"
                      >
                        #{orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3 py-5 whitespace-nowrap align-middle">
                      {getDeliveryStatusBadge(deliveryStatus, isNonSelectionGallery)}
                    </TableCell>
                    <TableCell className="px-3 py-5 align-middle">
                      {getPaymentStatusBadge(paymentStatus)}
                    </TableCell>
                    <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                      {formatPrice(totalCents)}
                    </TableCell>
                    <TableCell className="px-3 py-5 text-base text-gray-500 dark:text-gray-400 align-middle">
                      {createdAt ? new Date(createdAt).toLocaleDateString("pl-PL") : "-"}
                    </TableCell>
                    <TableCell className="px-3 py-5 align-middle">
                      <div className="flex items-center gap-2">
                        {deliveryStatus === "CHANGES_REQUESTED" && (
                          <>
                            {onApproveChangeRequest && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => onApproveChangeRequest(galleryId, orderId)}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                Zatwierdź
                              </Button>
                            )}
                            {onDenyChangeRequest && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onDenyChangeRequest(galleryId, orderId)}
                              >
                                Odrzuć
                              </Button>
                            )}
                          </>
                        )}
                        <Link href={`/galleries/${galleryId}/orders/${orderId}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="max-[1350px]:px-0 max-[1350px]:w-auto max-[1350px]:h-auto max-[1350px]:bg-transparent max-[1350px]:border-0 max-[1350px]:ring-0 max-[1350px]:shadow-none hover:max-[1350px]:bg-transparent dark:max-[1350px]:bg-transparent dark:hover:max-[1350px]:bg-transparent"
                          >
                            <Eye className="w-4 h-4 hidden max-[1350px]:block" />
                            <span className="max-[1350px]:hidden">Szczegóły</span>
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
  );
};
