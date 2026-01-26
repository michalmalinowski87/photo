import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";

import { getUserIdentitySync, type UserIdentity } from "../hooks/useUserIdentity";
import { initAuth, getIdToken } from "../lib/auth";
import { setupDashboardAuthStatusListener } from "../lib/dashboard-auth-status";
import { setupTokenSharingListener, requestTokensFromOtherDomains } from "../lib/token-sharing";
import { useAuthStore } from "../store";
import { getConfig } from "../lib/config";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserIdentity | null;
  // Session expiration state
  isSessionExpired: boolean;
  returnUrl: string;
  setSessionExpired: (expired: boolean, returnUrl?: string) => void;
  // Method to immediately update auth state after login
  updateAuthState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Initialize auth state synchronously from localStorage (runs before first render)
const getInitialAuthState = (): {
  isAuthenticated: boolean;
  user: UserIdentity | null;
  isLoading: boolean;
} => {
  try {
    const userIdentity = getUserIdentitySync();
    if (userIdentity) {
      return { isAuthenticated: true, user: userIdentity, isLoading: false };
    }
  } catch {
    // Ignore errors, will check async
  }
  return { isAuthenticated: false, user: null, isLoading: true };
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  // Initialize state synchronously from localStorage to prevent loading flicker
  const initialState = getInitialAuthState();
  const [isAuthenticated, setIsAuthenticated] = useState(initialState.isAuthenticated);
  const [isLoading, setIsLoading] = useState(initialState.isLoading);
  const [user, setUser] = useState<UserIdentity | null>(initialState.user);

  // Session expiration state from Zustand store
  const isSessionExpired = useAuthStore((state) => state.isSessionExpired);
  const returnUrl = useAuthStore((state) => state.returnUrl);
  const setSessionExpired = useAuthStore((state) => state.setSessionExpired);

  // Check auth state synchronously from localStorage first (fast path)
  const checkAuthStateSync = (): boolean => {
    try {
      const userIdentity = getUserIdentitySync();
      if (userIdentity) {
        setUser(userIdentity);
        setIsAuthenticated(true);
        setIsLoading(false);
        return true;
      }
    } catch {
      // Ignore errors, will check async
    }
    return false;
  };

  // Method to immediately update auth state after login
  const updateAuthState = async (): Promise<void> => {
    try {
      const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
      const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

      if (userPoolId && clientId) {
        initAuth(userPoolId, clientId);

        // Small delay to ensure tokens are stored
        await new Promise((resolve) => setTimeout(resolve, 50));

        try {
          await getIdToken();

          // Extract user identity from token
          const userIdentity = getUserIdentitySync();
          if (userIdentity) {
            setUser(userIdentity);
            setIsAuthenticated(true);
            setIsLoading(false);
            
            // Fetch config after successful authentication (non-blocking)
            getConfig().catch((error) => {
              console.warn('Failed to fetch config after login:', error);
            });
            
            return;
          }
        } catch {
          // Fallback to localStorage check
          const userIdentity = getUserIdentitySync();
          if (userIdentity) {
            setUser(userIdentity);
            setIsAuthenticated(true);
            setIsLoading(false);
            return;
          }
        }
      } else {
        // Fallback to localStorage for manual token
        const userIdentity = getUserIdentitySync();
        if (userIdentity) {
          setUser(userIdentity);
          setIsAuthenticated(true);
          setIsLoading(false);
          return;
        }
      }

      setIsAuthenticated(false);
      setIsLoading(false);
    } catch {
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Setup auth status listener for landing page to check auth
    setupDashboardAuthStatusListener();

    // Setup token sharing listener
    setupTokenSharingListener();

    // Request tokens from landing domain if available
    requestTokensFromOtherDomains();

    // First, try synchronous check from localStorage (fast path, no loading flicker)
    if (checkAuthStateSync()) {
      // Auth state set synchronously, still do async verification in background
      void (async () => {
        try {
          const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
          const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

          if (userPoolId && clientId) {
            initAuth(userPoolId, clientId);
            await getIdToken();
            // Verify user identity is still valid
            const userIdentity = getUserIdentitySync();
            if (userIdentity) {
              setUser(userIdentity);
              setIsAuthenticated(true);
              
              // Fetch config after token refresh (non-blocking)
              getConfig().catch((error) => {
                console.warn('Failed to fetch config after refresh:', error);
              });
            }
          }
        } catch {
          // Token invalid, reset state
          setIsAuthenticated(false);
          setUser(null);
        }
      })();
      return;
    }

    // No token found synchronously, do async check
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
              
              // Fetch config after successful authentication (non-blocking)
              getConfig().catch((error) => {
                console.warn('Failed to fetch config after initialization:', error);
              });
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
      } catch {
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
      updateAuthState,
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
