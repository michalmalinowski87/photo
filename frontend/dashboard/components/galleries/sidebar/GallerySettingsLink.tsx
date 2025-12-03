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
  hasDeliveredOrders,
}) => {
  const router = useRouter();
  const isOnOrderPage = router.pathname?.includes("/orders/");

  const settingsHref =
    isOnOrderPage && orderId
      ? `/galleries/${galleryId}/orders/${orderId}/settings`
      : `/galleries/${galleryId}/settings`;

  if (hasDeliveredOrders) {
    return (
      <li>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
          title="Ustawienia galerii są zablokowane dla dostarczonych galerii"
        >
          <Settings size={20} />
          <span>Ustawienia</span>
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={settingsHref}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          router.pathname === `/galleries/[id]/settings` ||
          router.pathname === `/galleries/[id]/orders/[orderId]/settings`
            ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        }`}
      >
        <Settings size={20} />
        <span>Ustawienia</span>
      </Link>
    </li>
  );
};
