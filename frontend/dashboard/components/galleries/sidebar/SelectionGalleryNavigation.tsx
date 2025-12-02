import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import { useGalleryStore } from "../../../store/gallerySlice";

interface SelectionGalleryNavigationProps {
  galleryId: string;
}

export const SelectionGalleryNavigation: React.FC<SelectionGalleryNavigationProps> = ({
  galleryId,
}) => {
  const router = useRouter();

  return (
    <>
      {/* Orders Link */}
      <li>
        <Link
          href={`/galleries/${galleryId}`}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            router.pathname === `/galleries/[id]` &&
            !router.asPath.includes("/photos") &&
            !router.asPath.includes("/settings") &&
            !router.asPath.includes("/orders/")
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
      </li>

      {/* Photos Link */}
      <li>
        <Link
          href={`/galleries/${galleryId}/photos`}
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
    </>
  );
};

