import Badge from "../ui/badge/Badge";

type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";

interface StatusBadgesProps {
  deliveryStatus?: string;
  paymentStatus?: string;
}

export function DeliveryStatusBadge({ status }: { status?: string }) {
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
}

export function PaymentStatusBadge({ status }: { status?: string }) {
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
}

export function StatusBadges({ deliveryStatus, paymentStatus }: StatusBadgesProps) {
  return (
    <div className="flex gap-2">
      <DeliveryStatusBadge status={deliveryStatus} />
      <PaymentStatusBadge status={paymentStatus} />
    </div>
  );
}

