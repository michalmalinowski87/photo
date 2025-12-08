import { FileText, Image as ImageIcon } from "lucide-react";
import React from "react";

import { useGalleryRoute } from "../../../hooks/useGalleryRoute";
import { useNavigation } from "../../../hooks/useNavigation";

interface SelectionGalleryNavigationProps {
  galleryId: string;
}

export const SelectionGalleryNavigation: React.FC<SelectionGalleryNavigationProps> = ({
  galleryId,
}) => {
  const galleryRoute = useGalleryRoute();
  const { navigate } = useNavigation();

  const isOrdersActive = galleryRoute.isGalleryDetail;
  const isPhotosActive = galleryRoute.isGalleryPhotos;

  const handleOrdersClick = () => {
    void navigate(`/galleries/${galleryId}`);
  };

  const handlePhotosClick = () => {
    void navigate(`/galleries/${galleryId}/photos`);
  };

  return (
    <>
      {/* Orders Link */}
      <li>
        <button
          onClick={handleOrdersClick}
          className={`flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-colors w-full text-left ${
            isOrdersActive
              ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          <FileText size={26} />
          <span>Zlecenia</span>
        </button>
      </li>

      {/* Photos Link */}
      <li>
        <button
          onClick={handlePhotosClick}
          className={`flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-colors w-full text-left ${
            isPhotosActive
              ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          <ImageIcon size={26} />
          <span>Zdjęcia</span>
        </button>
      </li>
    </>
  );
};
