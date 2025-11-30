import { useState } from "react";

import { useSidebar } from "../../hooks/useSidebar";
import CreateGalleryWizard from "../galleries/CreateGalleryWizard";
import { WelcomePopupWrapper } from "../welcome/WelcomePopupWrapper";

import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";

interface AppLayoutProps {
  children: React.ReactNode;
  onCreateGallery?: () => void;
}

const LayoutContent: React.FC<AppLayoutProps> = ({ children, onCreateGallery }) => {
  const { isMobileOpen } = useSidebar();
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleCreateGallery = () => {
    setWizardOpen(true);
  };

  const handleWizardSuccess = (galleryId: string) => {
    setWizardOpen(false);
    if (typeof window !== "undefined") {
      // Store dashboard as referrer when creating a new gallery
      const referrerKey = `gallery_referrer_${galleryId}`;
      sessionStorage.setItem(referrerKey, window.location.pathname);
      window.location.href = `/galleries/${galleryId}`;
    }
  };

  return (
    <div className="min-h-screen xl:flex bg-gray-50 dark:bg-gray-dark">
      <WelcomePopupWrapper onCreateGallery={onCreateGallery ?? handleCreateGallery} />
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      <div
        className={`flex-1 transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-dark lg:ml-[290px] ${
          isMobileOpen ? "ml-0" : ""
        }`}
      >
        <AppHeader onCreateGallery={onCreateGallery ?? handleCreateGallery} />
        <div className="p-4 mx-auto max-w-7xl md:p-6">
          {wizardOpen ? (
            <CreateGalleryWizard
              isOpen={wizardOpen}
              onClose={() => setWizardOpen(false)}
              onSuccess={handleWizardSuccess}
            />
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
};

const AppLayout: React.FC<AppLayoutProps> = ({ children, onCreateGallery }) => {
  return <LayoutContent onCreateGallery={onCreateGallery}>{children}</LayoutContent>;
};

export default AppLayout;
