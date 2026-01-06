import { Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

interface GallerySettingsLinkProps {
  galleryId: string;
  orderId?: string;
  hasDeliveredOrders: boolean;
}

export const GallerySettingsLink = ({
  galleryId,
  orderId,
  hasDeliveredOrders: _hasDeliveredOrders,
}: GallerySettingsLinkProps) => {
  const router = useRouter();
  const isOnOrderPage = router.pathname?.includes("/orders/");

  const settingsHref =
    isOnOrderPage && orderId
      ? `/galleries/${galleryId}/orders/${orderId}/settings`
      : `/galleries/${galleryId}/settings`;

  return (
    <li>
      <Link
        href={settingsHref}
        className={`flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
          router.pathname === `/galleries/[id]/settings` ||
          router.pathname === `/galleries/[id]/orders/[orderId]/settings`
            ? "bg-photographer-accentLight/50 text-photographer-accentDark font-semibold dark:bg-photographer-accent/20 dark:text-photographer-accent"
            : "text-gray-700 hover:bg-photographer-elevated dark:text-gray-300 dark:hover:bg-white/5"
        }`}
      >
        <Settings size={26} />
        <span>Ustawienia</span>
      </Link>
    </li>
  );
};
