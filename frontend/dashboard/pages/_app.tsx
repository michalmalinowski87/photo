import { QueryClientProvider } from "@tanstack/react-query";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";

// Import both CSS files - Next.js will handle them correctly
// Auth CSS is loaded for auth routes, dashboard CSS for dashboard routes
import "../styles/globals.css";
import "../styles/auth.css";
import { WebPCompatibilityCheck } from "../../shared-auth/webp-check";
import AuthLayout from "../components/auth/AuthLayout";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { SessionExpiredModalWrapper } from "../components/auth/SessionExpiredModalWrapper";
import { ClientOnly } from "../components/ClientOnly";
import { FullPageLoading } from "../components/ui/loading/Loading";
import { MobileWarningModal } from "../components/ui/mobile-warning/MobileWarningModal";
import { ToastContainer } from "../components/ui/toast/ToastContainer";
import { ZipDownloadContainer } from "../components/ui/zip-download/ZipDownloadContainer";
import { UploadRecoveryModal } from "../components/uppy/UploadRecoveryModal";
import { AuthProvider, useAuth } from "../context/AuthProvider";
import { useOrderStatusPolling } from "../hooks/queries/useOrderStatusPolling";
import { DelayedLoadingOverlay } from "../hooks/useDelayedLoadingOverlay";
import { useIsMobile } from "../hooks/useIsMobile";
import { useUploadRecovery } from "../hooks/useUploadRecovery";
import { initDevTools } from "../lib/dev-tools";
import {
  useBundleLoading,
  dynamicWithLoading,
  setNavigationLoadingState,
} from "../lib/dynamicWithLoading";
import { makeQueryClient } from "../lib/react-query";
import { cleanupStaleSessionStorage } from "../lib/sessionStorageCleanup";
import { useAuthStore, useThemeStore } from "../store";
import { useUnifiedStore } from "../store/unifiedStore";

// Lazy load heavy components to reduce initial bundle size
const ReactQueryDevtools = dynamic(
  () => import("@tanstack/react-query-devtools").then((mod) => mod.ReactQueryDevtools),
  { ssr: false }
);

const AppLayout = dynamic(() => import("../components/layout/AppLayout"), {
  loading: () => <FullPageLoading />,
});

// Use dynamicWithLoading to track bundle loading for gallery layout wrapper
const GalleryLayoutWrapper = dynamicWithLoading(
  () => import("../components/layout/GalleryLayoutWrapper"),
  {
    loading: () => <FullPageLoading text="Ładowanie galerii..." />,
  }
);

// Routes that should use the auth layout (login template)
const AUTH_ROUTES = [
  "/login",
  "/sign-up",
  "/verify-email",
  "/register-subdomain",
  "/auth/auth-callback",
  "/auth/undo-deletion/[token]",
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
  const navigationLoading = useUnifiedStore((state) => state.navigationLoading);
  const setNavigationLoading = useUnifiedStore((state) => state.setNavigationLoading);

  // Track gallery navigation loading (for delayed overlay)
  // Use ref to persist state across renders and avoid clearing too early
  const isGalleryNavigatingRef = useRef(false);
  const [isGalleryNavigating, setIsGalleryNavigating] = useState(false);

  // Track bundle loading state
  const isBundleLoading = useBundleLoading();

  // Skip hooks for 404 page during SSG (React 19/Next.js 15 compatibility)
  const is404Page = router.pathname === "/404";

  // Enable global order status polling when authenticated (skip for 404)
  useOrderStatusPolling({ enablePolling: isAuthenticated && !is404Page });

  // Clean up stale session storage entries on app initialization
  useEffect(() => {
    if (typeof window !== "undefined" && !is404Page) {
      // Run cleanup once on mount, then periodically (every 5 minutes)
      cleanupStaleSessionStorage();
      const interval = setInterval(() => {
        cleanupStaleSessionStorage();
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(interval);
    }
  }, [is404Page]);

  // Check if current route is an auth route
  const isAuthRoute = router.pathname
    ? AUTH_ROUTES.includes(router.pathname) || router.pathname.startsWith("/auth/undo-deletion/")
    : false;

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

    // Track all navigation start
    const handleRouteChangeStart = () => {
      // Set navigation state immediately for all route changes
      isGalleryNavigatingRef.current = true;
      setIsGalleryNavigating(true);
      // Also set navigation loading state in bundle tracker
      // This ensures bundle loading is tracked even if bundles are prefetched
      setNavigationLoadingState(true);
    };

    // Also handle route changes
    const handleRouteChangeComplete = () => {
      restoreThemeAndClearSessionExpired();
      // Clear navigation loading on any route change (in case user navigates away)
      setNavigationLoading(false);

      // Clear navigation state quickly to prevent delayed overlay flash on fast navigation
      // Use a minimal delay (50ms) to allow bundle loading components to mount
      // If bundles are loading, isBundleLoading will keep the overlay visible
      // If bundles aren't loading, clearing navigation state quickly prevents overlay from showing
      // The DelayedLoadingOverlay hook will see isBundleLoading=true and show overlay if bundles are loading
      requestAnimationFrame(() => {
        setTimeout(() => {
          isGalleryNavigatingRef.current = false;
          setIsGalleryNavigating(false);
        }, 50);
      });

      // Clear navigation loading state in bundle tracker
      // Use a delay to allow bundle loading components to mount and track their state
      setTimeout(() => {
        setNavigationLoadingState(false);
      }, 200);
      // Restore scroll position after navigation completes (if scroll was disabled)
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    };

    const handleRouteChangeError = () => {
      // Clear navigation loading on navigation error
      setNavigationLoading(false);
      isGalleryNavigatingRef.current = false;
      setIsGalleryNavigating(false);
      setNavigationLoadingState(false);
    };

    router.events.on("routeChangeStart", handleRouteChangeStart);
    router.events.on("routeChangeComplete", handleRouteChangeComplete);
    router.events.on("routeChangeError", handleRouteChangeError);

    // Note: Next.js Link components with prefetch={true} automatically prefetch
    // when links are visible in the viewport (using Intersection Observer).
    // This is more efficient than manual prefetching on hover.
    // All Link components should have prefetch={true} set.

    // Also intercept clicks on all internal links to set state immediately
    // This ensures overlay shows even before routeChangeStart fires
    const handleClick = (e: MouseEvent) => {
      const target = e.target;
      // e.target might be a text node or other non-Element, so we need to check
      if (!target) {
        return;
      }

      // Get the element - if target is not an Element, get parentElement
      const element = target instanceof Element ? target : (target as Node).parentElement;
      if (!element || typeof element.closest !== "function") {
        return;
      }

      const link = element.closest('a[href^="/"]');

      if (link && link instanceof HTMLAnchorElement && link.href) {
        try {
          const url = new URL(link.href);
          // Only handle internal links (same origin)
          if (url.origin === window.location.origin) {
            // Set navigation state immediately on click (before Next.js handles navigation)
            isGalleryNavigatingRef.current = true;
            setIsGalleryNavigating(true);
            setNavigationLoadingState(true);
          }
        } catch {
          // Invalid URL, ignore
        }
      }
    };

    if (typeof window !== "undefined") {
      document.addEventListener("click", handleClick, true); // Use capture phase to catch early
    }

    return () => {
      router.events.off("routeChangeStart", handleRouteChangeStart);
      router.events.off("routeChangeComplete", handleRouteChangeComplete);
      router.events.off("routeChangeError", handleRouteChangeError);
      if (typeof window !== "undefined") {
        document.removeEventListener("click", handleClick, true);
      }
    };
  }, [
    router.isReady,
    router.pathname,
    router.events,
    setSessionExpired,
    setNavigationLoading,
    is404Page,
  ]);

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

  // Combined loading state for all navigation: navigation OR bundle loading
  // Show overlay when navigating to any route OR when bundles are loading
  // Use ref value to ensure we don't lose state during rapid navigation
  const isNavigating = isGalleryNavigatingRef.current || isGalleryNavigating;
  const isAnyLoading = isNavigating || isBundleLoading;

  return (
    <>
      {/* Navigation loading overlay - shows when navigating to order pages */}
      {navigationLoading && <FullPageLoading text="Ładowanie zlecenia..." />}

      {/* Delayed loading overlay for gallery navigation - shows after frustration point (400ms) */}
      {/* Handles both navigation and bundle loading for gallery pages */}
      {/* Render globally so it works when navigating FROM gallery list TO gallery detail */}
      {/* Always render the component (it handles its own visibility) - must stay mounted to track delay */}
      {/* Delayed loading overlay for all navigation - shows after frustration point */}
      {/* Handles both navigation and bundle loading for all routes */}
      {/* Always render the component (it handles its own visibility) - must stay mounted to track delay */}
      {/* Longer delay in development (2s) to avoid showing overlay on fast dev speeds */}
      {/* minShowDuration prevents flickering when overlay shows and bundle loads almost immediately */}
      <DelayedLoadingOverlay
        isLoading={isAnyLoading}
        message={isBundleLoading ? "Ładowanie modułów..." : "Ładowanie..."}
        delay={process.env.NODE_ENV === "development" ? 2000 : 1000}
        minShowDuration={500}
      />

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
