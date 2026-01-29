import { Settings, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, useRef } from "react";

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [subMenuHeight, setSubMenuHeight] = useState(0);
  const subMenuRef = useRef<HTMLDivElement | null>(null);

  const basePath = isOnOrderPage && orderId
    ? `/galleries/${galleryId}/orders/${orderId}/settings`
    : `/galleries/${galleryId}/settings`;

  const subItems = [
    { name: "Ogólne", path: `${basePath}/general` },
    { name: "Pakiet", path: `${basePath}/package` },
    { name: "Personalizacja", path: `${basePath}/personalize` },
  ];

  // Check if any sub-item is active
  const isAnySubItemActive = subItems.some((item) => {
    const pathMatch = router.pathname === `/galleries/[id]/settings/[tab]` ||
      router.pathname === `/galleries/[id]/orders/[orderId]/settings/[tab]`;
    const tabMatch = router.query.tab === item.path.split("/").pop();
    return pathMatch && tabMatch;
  });

  // Auto-expand if any sub-item is active
  useEffect(() => {
    if (isAnySubItemActive) {
      setIsExpanded(true);
    }
  }, [isAnySubItemActive]);

  // Update submenu height when expanded
  useEffect(() => {
    if (isExpanded && subMenuRef.current) {
      setSubMenuHeight(subMenuRef.current.scrollHeight);
    } else {
      setSubMenuHeight(0);
    }
  }, [isExpanded]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const isActive = (path: string) => {
    const pathMatch = router.pathname === `/galleries/[id]/settings/[tab]` ||
      router.pathname === `/galleries/[id]/orders/[orderId]/settings/[tab]`;
    const tabMatch = router.query.tab === path.split("/").pop();
    return pathMatch && tabMatch;
  };

  return (
    <li>
      <button
        onClick={handleToggle}
        className={`flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-colors w-full ${
          isAnySubItemActive
            ? "bg-photographer-accentLight/50 text-photographer-accentDark font-semibold dark:bg-photographer-accent/20 dark:text-photographer-accent"
            : "text-gray-700 hover:bg-photographer-elevated dark:text-gray-300 dark:hover:bg-white/5"
        }`}
      >
        <Settings size={20} />
        <span className="flex-1 text-left">Ustawienia</span>
        <ChevronDown
          className={`w-5 h-5 transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        ref={subMenuRef}
        className="overflow-hidden transition-all duration-300"
        style={{ height: `${subMenuHeight}px` }}
      >
        <ul className="mt-1 space-y-0.5 ml-9">
          {subItems.map((item) => (
            <li key={item.name}>
              <Link
                href={item.path}
                prefetch={true}
                className={`flex items-center gap-4 px-4 py-2 rounded-lg text-standard font-medium transition-colors ${
                  isActive(item.path)
                    ? "bg-photographer-accentLight/50 text-photographer-accentDark font-semibold dark:bg-photographer-accent/20 dark:text-photographer-accent"
                    : "text-gray-700 hover:bg-photographer-elevated dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                <span>{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
};
