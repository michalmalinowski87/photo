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
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 12C11.1046 12 12 11.1046 12 10C12 8.89543 11.1046 8 10 8C8.89543 8 8 8.89543 8 10C8 11.1046 8.89543 12 10 12Z"
              fill="currentColor"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2ZM10 4C13.3137 4 16 6.68629 16 10C16 13.3137 13.3137 16 10 16C6.68629 16 4 13.3137 4 10C4 6.68629 6.68629 4 10 4ZM10 6C8.89543 6 8 6.89543 8 8C8 9.10457 8.89543 10 10 10C11.1046 10 12 9.10457 12 8C12 6.89543 11.1046 6 10 6Z"
              fill="currentColor"
            />
          </svg>
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
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 12C11.1046 12 12 11.1046 12 10C12 8.89543 11.1046 8 10 8C8.89543 8 8 8.89543 8 10C8 11.1046 8.89543 12 10 12Z"
            fill="currentColor"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2ZM10 4C13.3137 4 16 6.68629 16 10C16 13.3137 13.3137 16 10 16C6.68629 16 4 13.3137 4 10C4 6.68629 6.68629 4 10 4ZM10 6C8.89543 6 8 6.89543 8 8C8 9.10457 8.89543 10 10 10C11.1046 10 12 9.10457 12 8C12 6.89543 11.1046 6 10 6Z"
            fill="currentColor"
          />
        </svg>
        <span>Ustawienia</span>
      </Link>
    </li>
  );
};

