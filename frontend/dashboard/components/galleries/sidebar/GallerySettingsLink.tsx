import { Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

interface GallerySettingsLinkProps {
  galleryId: string;
  orderId?: string;
  hasDeliveredOrders: boolean;
}

export const GallerySettingsLink: React.FC<GallerySettingsLinkProps> = ({
  galleryId,
  orderId,
  hasDeliveredOrders: _hasDeliveredOrders,
}) => {
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
            ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        }`}
      >
        <Settings size={26} />
        <span>Ustawienia</span>
      </Link>
    </li>
  );
};
