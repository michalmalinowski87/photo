import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

// Import both CSS files - Next.js will handle them correctly
// Auth CSS is loaded for auth routes, dashboard CSS for dashboard routes
import "../styles/globals.css";
import "../styles/auth.css";
import { WebPCompatibilityCheck } from "../../shared-auth/webp-check";
import AuthLayout from "../components/auth/AuthLayout";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { SessionExpiredModalWrapper } from "../components/auth/SessionExpiredModalWrapper";
import { ClientOnly } from "../components/ClientOnly";
import AppLayout from "../components/layout/AppLayout";
import GalleryLayoutWrapper from "../components/layout/GalleryLayoutWrapper";
import { MobileWarningModal } from "../components/ui/mobile-warning/MobileWarningModal";
import { ToastContainer } from "../components/ui/toast/ToastContainer";
import { ZipDownloadContainer } from "../components/ui/zip-download/ZipDownloadContainer";
import { UploadRecoveryModal } from "../components/uppy/UploadRecoveryModal";
import { AuthProvider, useAuth } from "../context/AuthProvider";
import { useOrderStatusPolling } from "../hooks/queries/useOrderStatusPolling";
import { useIsMobile } from "../hooks/useIsMobile";
import { useUploadRecovery } from "../hooks/useUploadRecovery";
import { initDevTools } from "../lib/dev-tools";
import { makeQueryClient } from "../lib/react-query";
import { useAuthStore, useThemeStore } from "../store";

// Routes that should use the auth layout (login template)
const AUTH_ROUTES = [
  "/login",
  "/sign-up",
  "/verify-email",
  "/auth/auth-callback",
  "/forgot-password",
  "/verify-reset-code",
  "/reset-password",
];

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

export default function App(props: AppProps) {
  // Create a new QueryClient instance per request to avoid SSR issues
  // Use useState with lazy initializer to ensure it's only created once per component instance
  // This is important for SSR compatibility with React 19 and Next.js 15
  const [queryClient] = useState(() => makeQueryClient());
  const [isMounted, setIsMounted] = useState(false);

  // Track client-side mount to prevent hydration mismatch with ReactQueryDevtools
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // For 404 page during SSG, render without providers to avoid React 19 hook issues
  // The router isn't available during SSG, so we check the pathname from pageProps
  const is404Page = props.router?.pathname === "/404" || props.router?.pathname === undefined;
  const isSSG404 = is404Page && typeof window === "undefined";

  // Always render the same structure, but conditionally wrap with providers
  // This ensures hooks are always called in the same order
  if (isSSG404) {
    // During SSG for 404, render minimal component without providers
    return <props.Component {...props.pageProps} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WebPCompatibilityCheck>
        <AuthProvider>
          <AppContent {...props} />
        </AuthProvider>
      </WebPCompatibilityCheck>
      {process.env.NODE_ENV === "development" && isMounted && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

function AppContent({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { recoveryState, showModal, handleResume, handleClear } = useUploadRecovery();
  const [swRegistered, setSwRegistered] = useState(false);
  const [showMobileWarning, setShowMobileWarning] = useState<boolean>(false);
  const setSessionExpired = useAuthStore((state) => state.setSessionExpired);
  const { isAuthenticated } = useAuth();
  const isMobile = useIsMobile();

  // Skip hooks for 404 page during SSG (React 19/Next.js 15 compatibility)
  const is404Page = router.pathname === "/404";

  // Enable global order status polling when authenticated (skip for 404)
  useOrderStatusPolling({ enablePolling: isAuthenticated && !is404Page });

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

  // Global error handler for unhandled promise rejections (skip for 404 during SSG)
  useEffect(() => {
    if (is404Page && typeof window === "undefined") return;

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
  }, [isAuthRoute, router.asPath, is404Page]);

  // Removed reactive cleanup - navigation utility handles cleanup explicitly on user clicks

  // Restore theme and clear session expired state when on non-auth routes (skip for 404 during SSG)
  useEffect(() => {
    if (is404Page && typeof window === "undefined") return;

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
  }, [router.isReady, router.pathname, router.events, setSessionExpired, is404Page]);

  // Register Service Worker for Golden Retriever (skip for 404 during SSG)
  useEffect(() => {
    if (is404Page && typeof window === "undefined") return;
    if (typeof window !== "undefined" && "serviceWorker" in navigator && !swRegistered) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => {
          setSwRegistered(true);
        })
        .catch(() => {
          // Continue without Service Worker (fallback to IndexedDB only)
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swRegistered, is404Page]);

  // Initialize unified dev tools (development only, skip for 404 during SSG)
  useEffect(() => {
    if (is404Page && typeof window === "undefined") return;
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      initDevTools();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is404Page]);

  // Show mobile warning when on mobile device and authenticated (not on auth routes)
  useEffect(() => {
    if (is404Page) return;
    if (isMobile && isAuthenticated && !isAuthRoute && router.isReady) {
      // Check if user has already dismissed the warning in this session
      const dismissed = sessionStorage.getItem("mobile-warning-dismissed");
      if (dismissed !== "true") {
        setShowMobileWarning(true);
      }
    }
  }, [isMobile, isAuthenticated, isAuthRoute, router.isReady, is404Page]);

  // For 404 page, render it directly without layouts/providers to avoid SSG issues
  if (is404Page) {
    return <Component {...pageProps} />;
  }

  return (
    <>
      {/* Mobile warning modal for authenticated dashboard pages */}
      {!isAuthRoute && (
        <MobileWarningModal
          isOpen={showMobileWarning}
          onClose={() => setShowMobileWarning(false)}
        />
      )}
      {/* Auth routes don't need protection */}
      {isAuthRoute ? (
        <AuthLayout>
          <Component {...pageProps} />
        </AuthLayout>
      ) : (
        <ProtectedRoute>
          <ClientOnly>
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
            {isGalleryRoute ? (
              <GalleryLayoutWrapper>
                <Component {...pageProps} />
              </GalleryLayoutWrapper>
            ) : (
              <AppLayout>
                <Component {...pageProps} />
              </AppLayout>
            )}
          </ClientOnly>
        </ProtectedRoute>
      )}
    </>
  );
}
