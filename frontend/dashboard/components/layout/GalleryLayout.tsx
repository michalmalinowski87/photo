import { useRouter } from "next/router";

import { useGalleryStore } from "../../store";
import GallerySidebar from "../galleries/GallerySidebar";

import GalleryHeader from "./GalleryHeader";

interface GalleryLayoutProps {
  children: React.ReactNode;
  setPublishWizardOpen?: (open: boolean) => void;
}

const GalleryLayout: React.FC<GalleryLayoutProps> = ({ children, setPublishWizardOpen }) => {
  const router = useRouter();
  const { id: galleryId } = router.query;

  // Only show sidebar when on a gallery route
  const isOnGalleryRoute =
    router.pathname?.includes("/galleries/") || router.asPath?.includes("/galleries/");

  // Subscribe to store for gallery and loading state
  const storeIsLoading = useGalleryStore((state) => state.isLoading);
  const storeGallery = useGalleryStore((state) => state.currentGallery);

  // Show sidebar when:
  // 1. We're on a gallery route AND
  // 2. (Gallery is loaded (has data), OR Gallery is loading (shows loading states), OR We have galleryId from URL)
  // The sidebar subscribes to store directly and handles loading states automatically
  const hasGallery = Boolean(storeGallery?.galleryId);
  const shouldShowSidebar =
    isOnGalleryRoute && (hasGallery || storeIsLoading || Boolean(galleryId));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-dark">
      <div className="flex">
        <div>
          {shouldShowSidebar && <GallerySidebar setPublishWizardOpen={setPublishWizardOpen} />}
        </div>
        <div className="flex-1 transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-dark lg:ml-[380px]">
          <GalleryHeader />
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default GalleryLayout;
