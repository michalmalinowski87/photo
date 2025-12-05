import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";

import { initAuth, getIdToken } from "../lib/auth";
import { setupDashboardAuthStatusListener } from "../lib/dashboard-auth-status";
import { setupTokenSharingListener, requestTokensFromOtherDomains } from "../lib/token-sharing";
import { useAuthStore, useUserStore } from "../store";

interface TokenPayload {
  sub?: string;
  "cognito:username"?: string;
  email?: string;
  exp?: number;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: {
    userId: string | null;
    email: string | null;
    username: string | null;
  } | null;
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
  const user = useUserStore((state) => ({
    userId: state.userId,
    email: state.email,
    username: state.username,
  }));

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
            const token = await getIdToken();

            // Extract user data from token and populate Zustand store
            try {
              const payload = JSON.parse(atob(token.split(".")[1])) as TokenPayload;
              const userId = payload.sub ?? payload["cognito:username"] ?? "";
              const email = payload.email ?? "";
              const username = payload["cognito:username"] ?? payload.email ?? "";

              // Populate user store (only if values changed)
              if (typeof window !== "undefined") {
                const currentUser = useUserStore.getState();
                if (
                  currentUser.userId !== userId ||
                  currentUser.email !== email ||
                  currentUser.username !== username
                ) {
                  useUserStore.getState().setUser(userId, email, username);
                }
              }

              setIsAuthenticated(true);
            } catch (_e) {
              // Failed to parse token
              setIsAuthenticated(false);
            }
          } catch {
            // No valid session, check localStorage for manual token
            const stored = localStorage.getItem("idToken");
            if (stored) {
              try {
                const payload = JSON.parse(atob(stored.split(".")[1])) as TokenPayload;
                const now = Math.floor(Date.now() / 1000);
                if (payload.exp && payload.exp > now) {
                  // Extract user data from token and populate Zustand store
                  const userId = payload.sub ?? payload["cognito:username"] ?? "";
                  const email = payload.email ?? "";
                  const username = payload["cognito:username"] ?? payload.email ?? "";

                  if (typeof window !== "undefined") {
                    const currentUser = useUserStore.getState();
                    if (
                      currentUser.userId !== userId ||
                      currentUser.email !== email ||
                      currentUser.username !== username
                    ) {
                      useUserStore.getState().setUser(userId, email, username);
                    }
                  }

                  setIsAuthenticated(true);
                  return;
                }
              } catch (_e) {
                // Invalid token
              }
            }
            setIsAuthenticated(false);
          }
        } else {
          // Fallback to localStorage for manual token
          const stored = localStorage.getItem("idToken");
          if (stored) {
            try {
              const payload = JSON.parse(atob(stored.split(".")[1])) as TokenPayload;
              const now = Math.floor(Date.now() / 1000);
              if (payload.exp && payload.exp > now) {
                const userId = payload.sub ?? payload["cognito:username"] ?? "";
                const email = payload.email ?? "";
                const username = payload["cognito:username"] ?? payload.email ?? "";

                if (typeof window !== "undefined") {
                  const currentUser = useUserStore.getState();
                  if (
                    currentUser.userId !== userId ||
                    currentUser.email !== email ||
                    currentUser.username !== username
                  ) {
                    useUserStore.getState().setUser(userId, email, username);
                  }
                }

                setIsAuthenticated(true);
                return;
              }
            } catch (_e) {
              // Invalid token
            }
          }
          setIsAuthenticated(false);
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
      user: user.userId ? user : null,
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
