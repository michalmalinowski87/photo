import { useRouter } from "next/router";

import { useGallery } from "../../hooks/queries/useGalleries";
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

  // Get galleryId for query
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  // Use React Query to check if gallery exists or is loading
  const { data: gallery, isLoading: galleryLoading } = useGallery(galleryIdForQuery);

  // Show sidebar when:
  // 1. We're on a gallery route AND
  // 2. (Gallery is loaded (has data), OR Gallery is loading (shows loading states), OR We have galleryId from URL)
  const hasGallery = Boolean(gallery?.galleryId);
  const shouldShowSidebar =
    isOnGalleryRoute && (hasGallery || galleryLoading || Boolean(galleryId));

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
