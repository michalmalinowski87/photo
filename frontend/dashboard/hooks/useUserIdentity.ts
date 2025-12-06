import { useMemo } from "react";

interface TokenPayload {
  sub?: string;
  "cognito:username"?: string;
  email?: string;
  exp?: number;
}

export interface UserIdentity {
  userId: string;
  email: string;
  username: string;
}

/**
 * Hook to extract user identity from JWT token on-demand
 * No Zustand storage - reads directly from token
 *
 * @returns User identity object or null if token is invalid/missing
 */
export function useUserIdentity(): UserIdentity | null {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      // Try to get token from localStorage first (faster)
      const storedToken = localStorage.getItem("idToken");
      if (storedToken) {
        try {
          const payload = JSON.parse(atob(storedToken.split(".")[1])) as TokenPayload;
          const now = Math.floor(Date.now() / 1000);

          // Check if token is expired
          if (payload.exp && payload.exp <= now) {
            return null;
          }

          const userId = payload.sub ?? payload["cognito:username"] ?? "";
          const email = payload.email ?? "";
          const username = payload["cognito:username"] ?? payload.email ?? "";

          if (userId && email && username) {
            return { userId, email, username };
          }
        } catch {
          // Invalid token format, continue to try getIdToken
        }
      }

      // If no stored token or invalid, try to get from Cognito SDK
      // Note: This is async, but we return null for now and let components handle loading
      // In practice, components should wait for auth initialization before using this
      return null;
    } catch {
      return null;
    }
  }, []); // Empty deps - token changes are handled by auth system, not React state
}

/**
 * Synchronous function to get user identity from stored token
 * Useful for non-React contexts or when you need immediate access
 *
 * @returns User identity object or null if token is invalid/missing
 */
export function getUserIdentitySync(): UserIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedToken = localStorage.getItem("idToken");
    if (!storedToken) {
      return null;
    }

    const payload = JSON.parse(atob(storedToken.split(".")[1])) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);

    // Check if token is expired
    if (payload.exp && payload.exp <= now) {
      return null;
    }

    const userId = payload.sub ?? payload["cognito:username"] ?? "";
    const email = payload.email ?? "";
    const username = payload["cognito:username"] ?? payload.email ?? "";

    if (userId && email && username) {
      return { userId, email, username };
    }

    return null;
  } catch {
    return null;
  }
}
