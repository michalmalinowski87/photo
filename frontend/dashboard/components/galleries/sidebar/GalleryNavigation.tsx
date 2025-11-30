import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import { useGalleryStore } from "../../../store/gallerySlice";
import { useOrderStore } from "../../../store/orderSlice";

export const GalleryNavigation: React.FC = () => {
  const router = useRouter();
  const gallery = useGalleryStore((state) => state.currentGallery);
  const isLoading = useGalleryStore((state) => state.isLoading);
  
  // Check if there are delivered orders - we can compute this from store
  const hasDeliveredOrders = useGalleryStore((state) => {
    const orders = state.getGalleryOrders(gallery?.galleryId ?? "", 30000);
    if (!orders || orders.length === 0) return undefined;
    return orders.some((o: any) => o.deliveryStatus === "DELIVERED");
  });

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      <ul className="space-y-1">
        <li>
          {gallery?.galleryId ? (
            <Link
              href={`/galleries/${gallery.galleryId}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                router.pathname === `/galleries/[id]` &&
                !router.asPath.includes("/photos") &&
                !router.asPath.includes("/settings")
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
                  d="M3 4C3 2.89543 3.89543 2 5 2H15C16.1046 2 17 2.89543 17 4V16C17 17.1046 16.1046 18 15 18H5C3.89543 18 3 17.1046 3 16V4ZM5 4V16H15V4H5ZM6 6H14V8H6V6ZM6 10H14V12H6V10ZM6 14H11V16H6V14Z"
                  fill="currentColor"
                />
              </svg>
              <span>Zlecenia</span>
            </Link>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 4C3 2.89543 3.89543 2 5 2H15C16.1046 2 17 2.89543 17 4V16C17 17.1046 16.1046 18 15 18H5C3.89543 18 3 17.1046 3 16V4ZM5 4V16H15V4H5ZM6 6H14V8H6V6ZM6 10H14V12H6V10ZM6 14H11V16H6V14Z"
                  fill="currentColor"
                />
              </svg>
              <span>Zlecenia</span>
            </div>
          )}
        </li>
        {/* Only show "Zdjęcia" if gallery is loaded AND selection is enabled */}
        {!isLoading && gallery && gallery.selectionEnabled !== false && (
          <li>
            <Link
              href={`/galleries/${gallery.galleryId}/photos`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                router.pathname === `/galleries/[id]/photos`
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
                  d="M4 3C2.89543 3 2 3.89543 2 5V15C2 16.1046 2.89543 17 4 17H16C17.1046 17 18 16.1046 18 15V5C18 3.89543 17.1046 3 16 3H4ZM4 5H16V15H4V5ZM6 7C5.44772 7 5 7.44772 5 8C5 8.55228 5.44772 9 6 9C6.55228 9 7 8.55228 7 8C7 7.44772 6.55228 7 6 7ZM8 11L10.5 8.5L13 11L15 9V13H5V9L8 11Z"
                  fill="currentColor"
                />
              </svg>
              <span>Zdjęcia</span>
            </Link>
          </li>
        )}
        <li>
          {!isLoading && gallery ? (
            hasDeliveredOrders === true ? (
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
            ) : hasDeliveredOrders === false ? (
              <Link
                href={`/galleries/${gallery.galleryId}/settings`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  router.pathname === `/galleries/[id]/settings`
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
            ) : (
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
                title="Sprawdzanie statusu galerii..."
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
            )
          ) : null}
        </li>
      </ul>
    </nav>
  );
};
