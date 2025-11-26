import React from 'react';
import Badge from '../components/ui/badge/Badge';

export interface StatusBadgeConfig {
  deliveryStatus?: {
    [key: string]: { color: 'success' | 'error' | 'warning' | 'info' | 'light'; label: string };
  };
  paymentStatus?: {
    [key: string]: { color: 'success' | 'error' | 'warning' | 'info' | 'light'; label: string };
  };
  galleryState?: {
    [key: string]: { color: 'success' | 'error' | 'warning' | 'info' | 'light'; label: string };
  };
}

// Default status mappings
const defaultDeliveryStatusMap: StatusBadgeConfig['deliveryStatus'] = {
  CLIENT_SELECTING: { color: 'info', label: 'Wybór przez klienta' },
  CLIENT_APPROVED: { color: 'success', label: 'Zatwierdzone' },
  AWAITING_FINAL_PHOTOS: { color: 'warning', label: 'Oczekuje na finały' },
  CHANGES_REQUESTED: { color: 'warning', label: 'Prośba o zmiany' },
  PREPARING_FOR_DELIVERY: { color: 'info', label: 'Gotowe do wysyłki' },
  PREPARING_DELIVERY: { color: 'info', label: 'Oczekuje do wysłania' },
  DELIVERED: { color: 'success', label: 'Dostarczone' },
  CANCELLED: { color: 'error', label: 'Anulowane' },
};

const defaultPaymentStatusMap: StatusBadgeConfig['paymentStatus'] = {
  UNPAID: { color: 'error', label: 'Nieopłacone' },
  PARTIALLY_PAID: { color: 'warning', label: 'Częściowo opłacone' },
  PAID: { color: 'success', label: 'Opłacone' },
  REFUNDED: { color: 'error', label: 'Zwrócone' },
};

const defaultGalleryStateMap: StatusBadgeConfig['galleryState'] = {
  DRAFT: { color: 'warning', label: 'Wersja robocza' },
  PAID_ACTIVE: { color: 'success', label: 'Aktywna' },
  EXPIRED: { color: 'error', label: 'Wygasła' },
};

/**
 * Renders a delivery status badge
 */
export const DeliveryStatusBadge: React.FC<{
  status: string;
  config?: StatusBadgeConfig['deliveryStatus'];
}> = ({ status, config = defaultDeliveryStatusMap }) => {
  const statusInfo = config[status] || { color: 'light' as const, label: status };
  return (
    <Badge color={statusInfo.color} variant="light">
      {statusInfo.label}
    </Badge>
  );
};

/**
 * Renders a payment status badge
 */
export const PaymentStatusBadge: React.FC<{
  status: string;
  config?: StatusBadgeConfig['paymentStatus'];
}> = ({ status, config = defaultPaymentStatusMap }) => {
  const statusInfo = config[status] || { color: 'light' as const, label: status };
  return (
    <Badge color={statusInfo.color} variant="light">
      {statusInfo.label}
    </Badge>
  );
};

/**
 * Renders a gallery state badge
 */
export const GalleryStateBadge: React.FC<{
  state: string;
  config?: StatusBadgeConfig['galleryState'];
}> = ({ state, config = defaultGalleryStateMap }) => {
  const statusInfo = config[state] || { color: 'light' as const, label: state };
  return (
    <Badge color={statusInfo.color} variant="light">
      {statusInfo.label}
    </Badge>
  );
};

/**
 * HOC that provides status badge rendering utilities
 */
export function withStatusBadges<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  return function StatusBadgesComponent(props: P) {
    return (
      <WrappedComponent
        {...props}
        DeliveryStatusBadge={DeliveryStatusBadge}
        PaymentStatusBadge={PaymentStatusBadge}
        GalleryStateBadge={GalleryStateBadge}
      />
    );
  };
}

