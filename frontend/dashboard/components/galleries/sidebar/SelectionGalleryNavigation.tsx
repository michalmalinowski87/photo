import { FileText, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

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
          <FileText size={20} />
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
          <ImageIcon size={20} />
          <span>Zdjęcia</span>
        </Link>
      </li>
    </>
  );
};
