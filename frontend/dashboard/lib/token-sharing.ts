/**
 * Cross-Domain Token Sharing Utilities (Dashboard)
 *
 * Allows sharing authentication tokens with landing domain
 * using postMessage API. Dashboard is the source of truth for auth.
 */

import { isValidOrigin, isTrustedFixedOrigin, getBaseDomain, isTenantSubdomain } from "../../shared-auth/origin-validation";

import { getPublicDashboardUrl, getPublicGalleryUrl, getPublicLandingUrl } from "./public-env";

const TOKEN_SHARE_MESSAGE_TYPE = "PHOTOCLOUD_TOKEN_SHARE";
const TOKEN_REQUEST_MESSAGE_TYPE = "PHOTOCLOUD_TOKEN_REQUEST";
const TOKEN_RESPONSE_MESSAGE_TYPE = "PHOTOCLOUD_TOKEN_RESPONSE";

interface TokenShareMessage {
  type: typeof TOKEN_SHARE_MESSAGE_TYPE;
  idToken: string;
  accessToken?: string;
  refreshToken?: string;
  source: string;
}

interface TokenRequestMessage {
  type: typeof TOKEN_REQUEST_MESSAGE_TYPE;
  source: string;
  nonce?: string;
}

interface TokenResponseMessage {
  type: typeof TOKEN_RESPONSE_MESSAGE_TYPE;
  idToken: string;
  accessToken?: string;
  refreshToken?: string;
  source: string;
  nonce?: string;
}

type TokenMessage = TokenShareMessage | TokenRequestMessage | TokenResponseMessage;

/**
 * Request tokens from other domains (landing page)
 */
export function requestTokensFromOtherDomains(): void {
  if (typeof window === "undefined") {
    return;
  }

  const landingUrl = getPublicLandingUrl();

  const message: TokenRequestMessage = {
    type: TOKEN_REQUEST_MESSAGE_TYPE,
    source: window.location.origin,
  };

  // Request from opener window (if opened from landing)
  if (window.opener && window.opener !== window) {
    try {
      (window.opener as Window).postMessage(message, landingUrl);
    } catch (_e) {
      // Cross-origin error, ignore
    }
  }

  // Also try parent window (if in iframe)
  if (window.parent !== window) {
    try {
      window.parent.postMessage(message, landingUrl);
    } catch (_e) {
      // Cross-origin error, ignore
    }
  }
}

/**
 * Share tokens with other domains
 */
export function shareTokensWithOtherDomains(): void {
  if (typeof window === "undefined") {
    return;
  }

  const idToken = localStorage.getItem("idToken");
  const accessToken = localStorage.getItem("accessToken");
  const refreshToken = localStorage.getItem("refreshToken");

  if (!idToken) {
    return;
  }

  const landingUrl = getPublicLandingUrl();

  const message: TokenShareMessage = {
    type: TOKEN_SHARE_MESSAGE_TYPE,
    idToken,
    accessToken: accessToken ?? undefined,
    refreshToken: refreshToken ?? undefined,
    source: window.location.origin,
  };

  // Send to opener window
  if (window.opener && window.opener !== window) {
    try {
      (window.opener as Window).postMessage(message, landingUrl);
    } catch (_e) {
      // Ignore errors
    }
  }

  // Send to parent window
  if (window.parent !== window) {
    try {
      window.parent.postMessage(message, landingUrl);
    } catch (_e) {
      // Ignore errors
    }
  }
}

/**
 * Setup listener for token sharing messages
 */
export function setupTokenSharingListener(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("message", (event: MessageEvent<TokenMessage>) => {
    // Verify origin is trusted
    const dashboardUrl = getPublicDashboardUrl();
    const landingUrl = getPublicLandingUrl();
    const galleryUrl = getPublicGalleryUrl();

    const trustedOrigins = [dashboardUrl, landingUrl, galleryUrl].filter(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    );

    // Validate origin - fixed hosts must match exactly
    // For tenant subdomains: allow if they share the same base domain as any trusted origin
    const isValid =
      isTrustedFixedOrigin(event.origin, trustedOrigins) ||
      // For tenant subdomains, check if event origin is valid for any trusted base domain
      trustedOrigins.some((origin) => isValidOrigin(event.origin, origin)) ||
      // Allow tenant subdomains that share the same base domain as dashboard (for owner preview)
      (() => {
        try {
          const eventUrl = new URL(event.origin);
          const dashboardUrlObj = new URL(dashboardUrl);
          const eventBase = getBaseDomain(eventUrl.hostname);
          const dashboardBase = getBaseDomain(dashboardUrlObj.hostname);
          return eventBase === dashboardBase && isTenantSubdomain(eventUrl.hostname);
        } catch {
          return false;
        }
      })();

    if (!isValid) {
      return; // Ignore messages from untrusted origins
    }

    const data = event.data;

    // Handle token share message
    if (data?.type === TOKEN_SHARE_MESSAGE_TYPE) {
      const { idToken, accessToken, refreshToken } = data;

      if (idToken) {
        // Verify token is valid before storing
        try {
          const payload = JSON.parse(atob(idToken.split(".")[1])) as { exp?: number };
          const now = Math.floor(Date.now() / 1000);

          // Only store if token is not expired
          if (payload.exp && payload.exp > now) {
            localStorage.setItem("idToken", idToken);
            if (accessToken) {
              localStorage.setItem("accessToken", accessToken);
            }
            if (refreshToken) {
              localStorage.setItem("refreshToken", refreshToken);
            }

            // Reload page to update auth state
            window.location.reload();
          }
        } catch (_e) {
          // Invalid token, ignore
        }
      }
    }

    // Handle token request message - respond if we have tokens (with nonce for security)
    if (data?.type === TOKEN_REQUEST_MESSAGE_TYPE) {
      const idToken = localStorage.getItem("idToken");
      const accessToken = localStorage.getItem("accessToken");
      const refreshToken = localStorage.getItem("refreshToken");

      if (idToken) {
        try {
          const payload = JSON.parse(atob(idToken.split(".")[1])) as { exp?: number };
          const now = Math.floor(Date.now() / 1000);

          if (payload.exp && payload.exp > now) {
            // Respond with tokens (include nonce if provided for secure handshake)
            const response: TokenResponseMessage = {
              type: TOKEN_RESPONSE_MESSAGE_TYPE,
              idToken,
              accessToken: accessToken ?? undefined,
              refreshToken: refreshToken ?? undefined,
              source: window.location.origin,
              nonce: data.nonce, // Echo back nonce for verification
            };

            if (event.source && "postMessage" in event.source) {
              (event.source as Window).postMessage(response, event.origin);
            }
          }
        } catch (_e) {
          // Invalid token, ignore
        }
      }
    }

    // Handle token response message
    if (data?.type === TOKEN_RESPONSE_MESSAGE_TYPE) {
      const { idToken, accessToken, refreshToken } = data;

      if (idToken) {
        try {
          const payload = JSON.parse(atob(idToken.split(".")[1])) as { exp?: number };
          const now = Math.floor(Date.now() / 1000);

          if (payload.exp && payload.exp > now) {
            localStorage.setItem("idToken", idToken);
            if (accessToken) {
              localStorage.setItem("accessToken", accessToken);
            }
            if (refreshToken) {
              localStorage.setItem("refreshToken", refreshToken);
            }

            // Reload page to update auth state
            window.location.reload();
          }
        } catch (_e) {
          // Invalid token, ignore
        }
      }
    }
  });
}
