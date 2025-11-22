import { useRouter } from 'next/router';
// Import both CSS files - Next.js will handle them correctly
// Auth CSS is loaded for auth routes, dashboard CSS for dashboard routes
import '../styles/globals.css';
import '../styles/auth.css';
import AuthLayout from '../components/auth/AuthLayout';

// Routes that should use the auth layout (login template)
const AUTH_ROUTES = ['/login', '/sign-up', '/verify-email', '/auth/auth-callback'];

export default function App({ Component, pageProps }) {
  const router = useRouter();
  // Check if current route is an auth route
  // router.pathname is available during SSR
  const isAuthRoute = router.pathname ? AUTH_ROUTES.includes(router.pathname) : false;

  // Use AuthLayout for authentication pages (uses landing page template)
  // Clean layout for dashboard pages (ready for CMS template)
  if (isAuthRoute) {
    return (
      <AuthLayout>
        <Component {...pageProps} />
      </AuthLayout>
    );
  }

  // Clean dashboard layout - ready for CMS template integration
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Component {...pageProps} />
    </div>
  );
}

