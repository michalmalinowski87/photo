import { useRouter } from 'next/router';
import { useEffect } from 'react';
// Import both CSS files - Next.js will handle them correctly
// Auth CSS is loaded for auth routes, dashboard CSS for dashboard routes
import '../styles/globals.css';
import '../styles/auth.css';
import AuthLayout from '../components/auth/AuthLayout';
import AppLayout from '../components/layout/AppLayout';
import GalleryLayoutWrapper from '../components/layout/GalleryLayoutWrapper';
import { ToastProvider } from '../context/ToastContext';

// Routes that should use the auth layout (login template)
const AUTH_ROUTES = ['/login', '/sign-up', '/verify-email', '/auth/auth-callback'];

// Routes that should use gallery layout (gallery-specific sidebar)
const GALLERY_ROUTES = ['/galleries/[id]', '/galleries/[id]/photos', '/galleries/[id]/settings', '/galleries/[id]/orders/[orderId]'];

export default function App({ Component, pageProps }) {
  const router = useRouter();
  // Check if current route is an auth route
  // router.pathname is available during SSR
  const isAuthRoute = router.pathname ? AUTH_ROUTES.includes(router.pathname) : false;
  
  // Check if current route is a gallery route (needs special layout)
  // Note: Gallery routes will handle their own layout internally
  const isGalleryRoute = router.pathname ? GALLERY_ROUTES.some(route => {
    const routePattern = route.replace(/\[.*?\]/g, '[^/]+');
    const regex = new RegExp(`^${routePattern}$`);
    return regex.test(router.pathname);
  }) : false;

  // Global error handler for unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      // Check if it's an auth error
      if (event.reason && (
        event.reason.message === 'No user logged in' ||
        event.reason.message === 'Invalid session' ||
        event.reason.message?.includes('No user logged in') ||
        event.reason.message?.includes('Invalid session')
      )) {
        event.preventDefault(); // Prevent default error logging
        // Only redirect if not already on an auth route
        if (!isAuthRoute && typeof window !== 'undefined') {
          const returnUrl = router.asPath || '/';
          window.location.href = `/login?returnUrl=${encodeURIComponent(returnUrl)}`;
        }
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [isAuthRoute, router.asPath]);

  // Use AuthLayout for authentication pages (uses landing page template)
  if (isAuthRoute) {
    return (
      <AuthLayout>
        <Component {...pageProps} />
      </AuthLayout>
    );
  }

  // Gallery routes handle their own layout (GalleryLayout)
  // Other dashboard pages use AppLayout
  if (isGalleryRoute) {
    // Gallery routes use persistent GalleryLayoutWrapper that keeps sidebar mounted
    return (
      <ToastProvider>
        <GalleryLayoutWrapper>
          <Component {...pageProps} />
        </GalleryLayoutWrapper>
      </ToastProvider>
    );
  }
  
  return (
    <AppLayout>
      <Component {...pageProps} />
    </AppLayout>
  );
}

