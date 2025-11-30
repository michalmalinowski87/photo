import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect } from "react";

// Import both CSS files - Next.js will handle them correctly
// Auth CSS is loaded for auth routes, dashboard CSS for dashboard routes
import "../styles/globals.css";
import "../styles/auth.css";
import { WebPCompatibilityCheck } from "../../shared-auth/webp-check";
import AuthLayout from "../components/auth/AuthLayout";
import AppLayout from "../components/layout/AppLayout";
import GalleryLayoutWrapper from "../components/layout/GalleryLayoutWrapper";
import { AuthProvider } from "../context/AuthContext";
import { BottomRightOverlayProvider } from "../context/BottomRightOverlayContext";
import { ModalProvider } from "../context/ModalContext";
import { ToastProvider } from "../context/ToastContext";
import { ZipDownloadProvider } from "../context/ZipDownloadContext";
import { clearEphemeralState } from "../store";

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
];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

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
        <AuthProvider>
          <ToastProvider>
            <ModalProvider>
              <ZipDownloadProvider>
                <BottomRightOverlayProvider>
                  <GalleryLayoutWrapper>
                    <Component {...pageProps} />
                  </GalleryLayoutWrapper>
                </BottomRightOverlayProvider>
              </ZipDownloadProvider>
            </ModalProvider>
          </ToastProvider>
        </AuthProvider>
      </WebPCompatibilityCheck>
    );
  }

  // Other dashboard pages use AppLayout
  return (
    <WebPCompatibilityCheck>
      <AuthProvider>
        <ToastProvider>
          <ModalProvider>
            <ZipDownloadProvider>
              <AppLayout>
                <Component {...pageProps} />
              </AppLayout>
            </ZipDownloadProvider>
          </ModalProvider>
        </ToastProvider>
      </AuthProvider>
    </WebPCompatibilityCheck>
  );
}
