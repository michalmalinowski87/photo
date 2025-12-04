/**
 * Shared authentication initialization utility
 * Sets up token sharing and checks for authentication
 */

import { useUserStore } from "../store";

import { initAuth, getIdToken } from "./auth";
import { setupDashboardAuthStatusListener } from "./dashboard-auth-status";
import { setupTokenSharingListener, requestTokensFromOtherDomains } from "./token-sharing";

interface TokenPayload {
  sub?: string;
  "cognito:username"?: string;
  email?: string;
  exp?: number;
}

/**
 * Initialize authentication and token sharing
 * Call this in useEffect on protected pages
 */
export function initializeAuth(
  onTokenFound?: (token: string) => void,
  onNoToken?: () => void
): void {
  // Setup auth status listener for landing page to check auth
  setupDashboardAuthStatusListener();

  // Setup token sharing listener
  setupTokenSharingListener();

  // Request tokens from landing domain if available (legacy - dashboard is now source of truth)
  // Give it a moment to receive tokens before checking localStorage
  setTimeout(() => {
    // Initialize auth and try to get token
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
      getIdToken()
        .then((token: string) => {
          // Extract user data from token and populate Zustand store
          try {
            const payload = JSON.parse(atob(token.split(".")[1])) as TokenPayload;
            const userId = payload.sub ?? payload["cognito:username"] ?? "";
            const email = payload.email ?? "";
            const username = payload["cognito:username"] ?? payload.email ?? "";

            // Populate user store (only if values changed)
            if (typeof window !== "undefined") {
              const currentUser = useUserStore.getState();
              // Only set if values are different to prevent duplicate updates
              if (
                currentUser.userId !== userId ||
                currentUser.email !== email ||
                currentUser.username !== username
              ) {
                useUserStore.getState().setUser(userId, email, username);
              }
              // Don't refresh wallet balance here - let components handle it when ready
              // The token might not be persisted to localStorage yet
            }
          } catch (_e) {
            // Failed to parse token, continue anyway
          }

          if (onTokenFound) {
            onTokenFound(token);
          }
        })
        .catch(() => {
          // No valid session, check localStorage for manual token
          const stored = localStorage.getItem("idToken");
          if (stored) {
            // Verify token is not expired
            try {
              const payload = JSON.parse(atob(stored.split(".")[1])) as TokenPayload;
              const now = Math.floor(Date.now() / 1000);
              if (payload.exp && payload.exp > now) {
                // Extract user data from token and populate Zustand store
                const userId = payload.sub ?? payload["cognito:username"] ?? "";
                const email = payload.email ?? "";
                const username = payload["cognito:username"] ?? payload.email ?? "";

                // Populate user store (only if values changed)
                if (typeof window !== "undefined") {
                  const currentUser = useUserStore.getState();
                  // Only set if values are different to prevent duplicate updates
                  if (
                    currentUser.userId !== userId ||
                    currentUser.email !== email ||
                    currentUser.username !== username
                  ) {
                    useUserStore.getState().setUser(userId, email, username);
                  }
                  // Don't refresh wallet balance here - let components handle it when ready
                }

                if (onTokenFound) {
                  onTokenFound(stored);
                }
                return;
              }
            } catch (_e) {
              // Invalid token
            }
          }
          // No valid token found
          if (onNoToken) {
            onNoToken();
          }
        });
    } else {
      // Fallback to localStorage for manual token
      const stored = localStorage.getItem("idToken");
      if (stored) {
        // Verify token is not expired
        try {
          const payload = JSON.parse(atob(stored.split(".")[1])) as TokenPayload;
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp > now) {
            // Extract user data from token and populate Zustand store
            const userId = payload.sub ?? payload["cognito:username"] ?? "";
            const email = payload.email ?? "";
            const username = payload["cognito:username"] ?? payload.email ?? "";

            // Populate user store (only if values changed)
            if (typeof window !== "undefined") {
              const currentUser = useUserStore.getState();
              // Only set if values are different to prevent duplicate updates
              if (
                currentUser.userId !== userId ||
                currentUser.email !== email ||
                currentUser.username !== username
              ) {
                useUserStore.getState().setUser(userId, email, username);
              }
              // Don't refresh wallet balance here - let components handle it when ready
            }

            if (onTokenFound) {
              onTokenFound(stored);
            }
            return;
          }
        } catch (_e) {
          // Invalid token
        }
      }
      // No valid token found
      if (onNoToken) {
        onNoToken();
      }
    }
  }, 200); // Wait 200ms for postMessage to complete

  // Also request tokens immediately
  requestTokensFromOtherDomains();
}

/**
 * Redirect to dashboard login page
 */
export function redirectToLandingSignIn(returnUrl: string = "/"): void {
  // Redirect to dashboard login page instead of landing sign-in
  const dashboardUrl =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  window.location.href = `${dashboardUrl}/login?returnUrl=${encodeURIComponent(returnUrl)}`;
}
