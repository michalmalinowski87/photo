import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";

import { initAuth, getIdToken } from "../lib/auth";
import { setupDashboardAuthStatusListener } from "../lib/dashboard-auth-status";
import { setupTokenSharingListener, requestTokensFromOtherDomains } from "../lib/token-sharing";
import { getUserIdentitySync, type UserIdentity } from "../hooks/useUserIdentity";
import { useAuthStore } from "../store";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserIdentity | null;
  // Session expiration state
  isSessionExpired: boolean;
  returnUrl: string;
  setSessionExpired: (expired: boolean, returnUrl?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserIdentity | null>(null);

  // Session expiration state from Zustand store
  const isSessionExpired = useAuthStore((state) => state.isSessionExpired);
  const returnUrl = useAuthStore((state) => state.returnUrl);
  const setSessionExpired = useAuthStore((state) => state.setSessionExpired);

  useEffect(() => {
    // Setup auth status listener for landing page to check auth
    setupDashboardAuthStatusListener();

    // Setup token sharing listener
    setupTokenSharingListener();

    // Request tokens from landing domain if available
    requestTokensFromOtherDomains();

    // Initialize auth and check for token
    const initializeAuth = async () => {
      try {
        const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
        const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

        if (userPoolId && clientId) {
          initAuth(userPoolId, clientId);

          // Give it a moment to receive tokens before checking localStorage
          await new Promise((resolve) => setTimeout(resolve, 200));

          try {
            await getIdToken();

            // Extract user identity from token (getUserIdentitySync reads from localStorage)
            const userIdentity = getUserIdentitySync();
            if (userIdentity) {
              setUser(userIdentity);
              setIsAuthenticated(true);
            } else {
              setIsAuthenticated(false);
            }
          } catch {
            // No valid session, check localStorage for manual token
            const userIdentity = getUserIdentitySync();
            if (userIdentity) {
              setUser(userIdentity);
              setIsAuthenticated(true);
              return;
            }
            setIsAuthenticated(false);
          }
        } else {
          // Fallback to localStorage for manual token
          const userIdentity = getUserIdentitySync();
          if (userIdentity) {
            setUser(userIdentity);
            setIsAuthenticated(true);
          } else {
            setIsAuthenticated(false);
          }
        }
      } catch (error) {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    void initializeAuth();
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated,
      isLoading,
      user,
      isSessionExpired,
      returnUrl,
      setSessionExpired,
    }),
    [isAuthenticated, isLoading, user, isSessionExpired, returnUrl, setSessionExpired]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
