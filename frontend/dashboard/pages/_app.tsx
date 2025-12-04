import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

// Import both CSS files - Next.js will handle them correctly
// Auth CSS is loaded for auth routes, dashboard CSS for dashboard routes
import "../styles/globals.css";
import "../styles/auth.css";
import { WebPCompatibilityCheck } from "../../shared-auth/webp-check";
import AuthLayout from "../components/auth/AuthLayout";
import { SessionExpiredModalWrapper } from "../components/auth/SessionExpiredModalWrapper";
import AppLayout from "../components/layout/AppLayout";
import GalleryLayoutWrapper from "../components/layout/GalleryLayoutWrapper";
import { ToastContainer } from "../components/ui/toast/ToastContainer";
import { ZipDownloadContainer } from "../components/ui/zip-download/ZipDownloadContainer";
import { UploadRecoveryModal } from "../components/uppy/UploadRecoveryModal";
import { useUploadRecovery } from "../hooks/useUploadRecovery";
import { clearEphemeralState } from "../store";
import { useAuthStore } from "../store/authSlice";
import { useThemeStore } from "../store/themeSlice";
import { initDevTools } from "../lib/dev-tools";

// Routes that should use the auth layout (login template)
const AUTH_ROUTES = ["/login", "/sign-up", "/verify-email", "/auth/auth-callback"];

// Filter route names that should NOT be treated as gallery IDs
const FILTER_ROUTES = [
  "wyslano",
  "wybrano",
  "prosba-o-zmiany",
  "gotowe-do-wysylki",
  "dostarczone",
  "robocze",
];

// Routes that should use gallery layout (gallery-specific sidebar)
const GALLERY_ROUTES = [
  "/galleries/[id]",
  "/galleries/[id]/photos",
  "/galleries/[id]/settings",
  "/galleries/[id]/orders/[orderId]",
  "/galleries/[id]/orders/[orderId]/settings",
];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { recoveryState, showModal, handleResume, handleClear } = useUploadRecovery();
  const [swRegistered, setSwRegistered] = useState(false);
  const setSessionExpired = useAuthStore((state) => state.setSessionExpired);

  // Initialize unified dev tools (development only)
  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      initDevTools();
    }
  }, []);

  // Register Service Worker for Golden Retriever
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && !swRegistered) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          setSwRegistered(true);
        })
        .catch((error) => {
          // Continue without Service Worker (fallback to IndexedDB only)
        });
    }
  }, [swRegistered]);

  // Check if current route is an auth route
  const isAuthRoute = router.pathname ? AUTH_ROUTES.includes(router.pathname) : false;

  // Check if current route is a gallery route (needs special layout)
  // Exclude filter routes from being treated as gallery routes
  const isGalleryRoute = router.pathname
    ? (() => {
        // Check if it's a filter route (not a gallery route)
        if (router.asPath?.startsWith("/galleries/")) {
          const pathSegments = router.asPath.split("/").filter(Boolean);
          if (pathSegments.length >= 2 && FILTER_ROUTES.includes(pathSegments[1])) {
            return false;
          }
        }
        // Also check pathname directly for filter routes
        if (router.pathname.startsWith("/galleries/")) {
          const pathSegments = router.pathname.split("/").filter(Boolean);
          if (pathSegments.length >= 2 && FILTER_ROUTES.includes(pathSegments[1])) {
            return false;
          }
        }
        // Check if it matches gallery route patterns
        return GALLERY_ROUTES.some((route) => {
          const routePattern = route.replace(/\[.*?\]/g, "[^/]+");
          const regex = new RegExp(`^${routePattern}$`);
          return regex.test(router.pathname);
        });
      })()
    : false;

  // Global error handler for unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Check if it's an auth error
      const reason = event.reason as Error | undefined;
      if (
        reason &&
        (reason.message === "No user logged in" ||
          reason.message === "Invalid session" ||
          reason.message?.includes("No user logged in") ||
          reason.message?.includes("Invalid session"))
      ) {
        event.preventDefault(); // Prevent default error logging
        // Only redirect if not already on an auth route
        if (!isAuthRoute && typeof window !== "undefined") {
          const returnUrl = router.asPath || "/";
          window.location.href = `/login?returnUrl=${encodeURIComponent(returnUrl)}`;
        }
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [isAuthRoute, router.asPath]);

  // Clear ephemeral state on route changes (but not on initial load)
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      // Don't clear on gallery route changes (they share state)
      if (!url.startsWith("/galleries/") || url.includes("/orders/")) {
        clearEphemeralState();
      }
    };

    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [router.events]);

  // Restore theme and clear session expired state when on non-auth routes
  useEffect(() => {
    const restoreThemeAndClearSessionExpired = () => {
      if (typeof window === "undefined") {
        return;
      }

      // Check if current route is an auth route
      const currentIsAuthRoute = router.pathname ? AUTH_ROUTES.includes(router.pathname) : false;

      if (!currentIsAuthRoute) {
        // Remove auth-dark class if present
        document.documentElement.classList.remove("auth-dark");
        document.body.classList.remove("auth-dark");

        // Restore theme from store
        const currentTheme = useThemeStore.getState().theme;
        if (currentTheme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }

        // Clear session expired state when on dashboard routes (successful login)
        setSessionExpired(false);
      }
    };

    // Restore immediately if not on auth route
    if (router.isReady) {
      restoreThemeAndClearSessionExpired();
    }

    // Also handle route changes
    const handleRouteChangeComplete = () => {
      restoreThemeAndClearSessionExpired();
    };

    router.events.on("routeChangeComplete", handleRouteChangeComplete);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChangeComplete);
    };
  }, [router.isReady, router.pathname, router.events, setSessionExpired]);

  // Use AuthLayout for authentication pages
  if (isAuthRoute) {
    return (
      <WebPCompatibilityCheck>
        <AuthLayout>
          <Component {...pageProps} />
        </AuthLayout>
      </WebPCompatibilityCheck>
    );
  }

  // Gallery routes handle their own layout
  if (isGalleryRoute) {
    return (
      <WebPCompatibilityCheck>
        <SessionExpiredModalWrapper />
        <ToastContainer />
        <ZipDownloadContainer />
        {recoveryState && (
          <UploadRecoveryModal
            isOpen={showModal}
            onClose={handleClear}
            onResume={handleResume}
            onClear={handleClear}
            fileCount={recoveryState.fileCount}
            galleryId={recoveryState.galleryId}
            type={recoveryState.type}
            orderId={recoveryState.orderId}
          />
        )}
        <GalleryLayoutWrapper>
          <Component {...pageProps} />
        </GalleryLayoutWrapper>
      </WebPCompatibilityCheck>
    );
  }

  // Other dashboard pages use AppLayout
  return (
    <WebPCompatibilityCheck>
      <SessionExpiredModalWrapper />
      <ToastContainer />
      <ZipDownloadContainer />
      {recoveryState && (
        <UploadRecoveryModal
          isOpen={showModal}
          onClose={handleClear}
          onResume={handleResume}
          onClear={handleClear}
          fileCount={recoveryState.fileCount}
          galleryId={recoveryState.galleryId}
          type={recoveryState.type}
          orderId={recoveryState.orderId}
        />
      )}
      <AppLayout>
        <Component {...pageProps} />
      </AppLayout>
    </WebPCompatibilityCheck>
  );
}
