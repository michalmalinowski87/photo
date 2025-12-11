import { useRouter } from "next/router";
import { useState, useEffect } from "react";

import { useGalleryCreationLoading } from "../../hooks/useGalleryCreationLoading";
import { useSidebar } from "../../hooks/useSidebar";
import { isGalleryRoute } from "../../lib/navigation";
import { useUnifiedStore } from "../../store/unifiedStore";
import CreateGalleryWizard from "../galleries/CreateGalleryWizard";
import { FullPageLoading } from "../ui/loading/Loading";
import { WelcomePopupWrapper } from "../welcome/WelcomePopupWrapper";

import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";

interface AppLayoutProps {
  children: React.ReactNode;
  onCreateGallery?: () => void;
}

const LayoutContent = ({ children, onCreateGallery }: AppLayoutProps) => {
  const router = useRouter();
  const { isMobileOpen } = useSidebar();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [devLocked, setDevLocked] = useState(false);
  const galleryCreationLoading = useGalleryCreationLoading();

  const handleCreateGallery = () => {
    setWizardOpen(true);
  };

  const handleWizardSuccess = (galleryId: string, orderId?: string, selectionEnabled?: boolean) => {
    if (!devLocked) {
      setWizardOpen(false);
    }
    if (typeof window !== "undefined") {
      // Store dashboard as referrer when creating a new gallery
      const referrerKey = `gallery_referrer_${galleryId}`;
      sessionStorage.setItem(referrerKey, window.location.pathname);

      // For non-selective galleries with an order, redirect to order page
      // For selective galleries, redirect to photos page as the first action is uploading photos
      if (!devLocked) {
        if (!selectionEnabled && orderId) {
          const orderPath = `/galleries/${galleryId}/orders/${orderId}`;
          void router.push(orderPath);
        } else {
          const photosPath = `/galleries/${galleryId}/photos`;
          void router.push(photosPath);
        }
      }
    }
  };

  // Listen for wizard open event (works in all environments)
  // Dev mode: Also check for lock flag
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOpenWizard = () => {
      // Dev mode: Check for lock flag
      if (process.env.NODE_ENV === "development") {
        interface WindowWithDevFlag extends Window {
          __galleryWizardDevLocked?: boolean;
        }
        const windowWithDevFlag = window as WindowWithDevFlag;
        const shouldLock = windowWithDevFlag.__galleryWizardDevLocked === true;
        if (shouldLock) {
          setDevLocked(true);
          windowWithDevFlag.__galleryWizardDevLocked = false; // Reset flag
        }
      }
      if (!wizardOpen) {
        setWizardOpen(true);
      }
    };

    window.addEventListener("openGalleryWizard", handleOpenWizard);
    return () => window.removeEventListener("openGalleryWizard", handleOpenWizard);
  }, [wizardOpen]);

  // Close wizard when navigating away (unless dev locked)
  // Use routeChangeComplete instead of routeChangeStart to prevent flicker
  // This keeps the wizard visible during navigation transition
  useEffect(() => {
    if (!wizardOpen || devLocked || !router.events) {
      return;
    }

    const handleRouteChangeComplete = () => {
      setWizardOpen(false);
    };

    const handleRouteChangeError = () => {
      // If navigation fails, keep wizard open (don't close it)
      // This prevents the wizard from closing when navigation errors occur
    };

    router.events.on("routeChangeComplete", handleRouteChangeComplete);
    router.events.on("routeChangeError", handleRouteChangeError);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChangeComplete);
      router.events.off("routeChangeError", handleRouteChangeError);
    };
  }, [wizardOpen, devLocked, router.events]);

  // Clear gallery creation flow state when navigating away from gallery routes
  useEffect(() => {
    if (!router.events) {
      return;
    }

    const setGalleryCreationFlowActive = useUnifiedStore.getState().setGalleryCreationFlowActive;

    const handleRouteChange = (url: string) => {
      // If navigating away from a gallery route, clear the flow state
      const currentIsGallery = isGalleryRoute(router.asPath);
      const targetIsGallery = isGalleryRoute(url);

      if (currentIsGallery && !targetIsGallery) {
        // Navigating away from gallery routes - clear flow state
        setGalleryCreationFlowActive(false);
      }
    };

    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [router.events, router.asPath]);

  return (
    <>
      {/* Global loading overlay that persists across navigation during gallery creation */}
      {galleryCreationLoading && <FullPageLoading text="Tworzenie galerii..." />}
      <div className="min-h-screen xl:flex bg-gray-50 dark:bg-gray-dark">
        <WelcomePopupWrapper onCreateGallery={onCreateGallery ?? handleCreateGallery} />
        <div>
          <AppSidebar />
          <Backdrop />
        </div>
        <div
          className={`flex-1 transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-dark lg:ml-[377px] ${
            isMobileOpen ? "ml-0" : ""
          }`}
        >
          <AppHeader onCreateGallery={onCreateGallery ?? handleCreateGallery} />
          <div
            className={`${wizardOpen ? "" : "p-4 mx-auto max-w-7xl md:p-6"} h-[calc(100vh-80px)]`}
          >
            {wizardOpen ? (
              <CreateGalleryWizard
                isOpen={wizardOpen}
                onClose={() => {
                  if (!devLocked) {
                    setWizardOpen(false);
                    setDevLocked(false);
                  }
                }}
                onSuccess={handleWizardSuccess}
                devLocked={devLocked}
              />
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const AppLayout = ({ children, onCreateGallery }: AppLayoutProps) => {
  return <LayoutContent onCreateGallery={onCreateGallery}>{children}</LayoutContent>;
};

export default AppLayout;
