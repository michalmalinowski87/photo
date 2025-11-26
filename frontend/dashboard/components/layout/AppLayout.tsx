import { useState } from "react";
import { SidebarProvider, useSidebar } from "../../context/SidebarContext";
import { ThemeProvider } from "../../context/ThemeContext";
import { ToastProvider } from "../../context/ToastContext";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";
import CreateGalleryWizard from "../galleries/CreateGalleryWizard";
import { WelcomePopupWrapper } from "../welcome/WelcomePopupWrapper";

interface AppLayoutProps {
  children: React.ReactNode;
  onCreateGallery?: () => void;
}

const LayoutContent: React.FC<AppLayoutProps> = ({ children, onCreateGallery }) => {
  const { isExpanded, isMobileOpen } = useSidebar();
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
      <WelcomePopupWrapper />
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      <div
        className={`flex-1 transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-dark lg:ml-[290px] ${
          isMobileOpen ? "ml-0" : ""
        }`}
      >
        <AppHeader onCreateGallery={onCreateGallery || handleCreateGallery} />
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
  return (
    <ThemeProvider>
      <ToastProvider>
        <SidebarProvider>
          <LayoutContent onCreateGallery={onCreateGallery}>{children}</LayoutContent>
        </SidebarProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default AppLayout;
