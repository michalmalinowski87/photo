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
  // router.pathname is available during SSR
  const isAuthRoute = router.pathname ? AUTH_ROUTES.includes(router.pathname) : false;

  // Check if current route is a gallery route (needs special layout)
  // Note: Gallery routes will handle their own layout internally
  // Exclude filter routes from being treated as gallery routes
  const isGalleryRoute = router.pathname
    ? (() => {
        // Check if the actual path (asPath) is a filter route
        // router.asPath shows the actual URL, router.pathname shows the route pattern
        if (router.asPath?.startsWith("/galleries/")) {
          const pathSegments = router.asPath.split("/").filter(Boolean);
          if (pathSegments.length >= 2) {
            const secondSegment = pathSegments[1];
            if (FILTER_ROUTES.includes(secondSegment)) {
              return false;
            }
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

  // Use AuthLayout for authentication pages (uses landing page template)
  if (isAuthRoute) {
    return (
      <WebPCompatibilityCheck>
        <AuthLayout>
          <Component {...pageProps} />
        </AuthLayout>
      </WebPCompatibilityCheck>
    );
  }

  // Gallery routes handle their own layout (GalleryLayout)
  // Other dashboard pages use AppLayout
  if (isGalleryRoute) {
    // Gallery routes use persistent GalleryLayoutWrapper that keeps sidebar mounted
    return (
      <WebPCompatibilityCheck>
        <AuthProvider>
          <ToastProvider>
            <ModalProvider>
              <ZipDownloadProvider>
                <GalleryLayoutWrapper>
                  <Component {...pageProps} />
                </GalleryLayoutWrapper>
              </ZipDownloadProvider>
            </ModalProvider>
          </ToastProvider>
        </AuthProvider>
      </WebPCompatibilityCheck>
    );
  }

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
