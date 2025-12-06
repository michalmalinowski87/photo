import { useRouter } from "next/router";
import { useEffect, ReactNode } from "react";

import { useAuth } from "../../context/AuthProvider";
import { FullPageLoading } from "../ui/loading/Loading";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute HOC that redirects to login if user is not authenticated
 * Based on React Router v6 pattern: https://blog.logrocket.com/authentication-react-router-v6/
 */
export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnUrl = router.asPath || "/";
      window.location.href = `/login?returnUrl=${encodeURIComponent(returnUrl)}`;
    }
  }, [isAuthenticated, isLoading, router.asPath]);

  // Show loading state while checking authentication
  if (isLoading) {
    return <FullPageLoading />;
  }

  // Don't render children if not authenticated (redirect will happen)
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};
