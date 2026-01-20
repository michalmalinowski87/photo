/**
 * Shared authentication initialization utility
 * Sets up token sharing and checks for authentication
 */

import { initAuth, getIdToken } from "./auth";
import { setupDashboardAuthStatusListener } from "./dashboard-auth-status";
import { getPublicDashboardUrl } from "./public-env";
import { setupTokenSharingListener, requestTokensFromOtherDomains } from "./token-sharing";

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
          // Token found - user identity is extracted on-demand via useUserIdentity hook
          // No need to populate Zustand store
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
              const payload = JSON.parse(atob(stored.split(".")[1])) as { exp?: number };
              const now = Math.floor(Date.now() / 1000);
              if (payload.exp && payload.exp > now) {
                // Token found - user identity is extracted on-demand via useUserIdentity hook
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
          const payload = JSON.parse(atob(stored.split(".")[1])) as { exp?: number };
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp > now) {
            // Token found - user identity is extracted on-demand via useUserIdentity hook
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
  const dashboardUrl = getPublicDashboardUrl();
  window.location.href = `${dashboardUrl}/login?returnUrl=${encodeURIComponent(returnUrl)}`;
}
