"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getToken, setToken, setOwnerToken, clearToken, setAuthMode } from "@/lib/token";
import { requestDashboardIdToken } from "@/lib/dashboard-token-sharing";

interface AuthContextType {
  token: string | null;
  galleryId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (galleryId: string, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ 
  children,
  galleryId: initialGalleryId 
}: { 
  children: ReactNode;
  galleryId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // Token state is only for isAuthenticated check - actual token is in sessionStorage
  const [tokenState, setTokenState] = useState<string | null>(null);
  const [galleryId, setGalleryId] = useState<string | null>(initialGalleryId || null);
  const [isLoading, setIsLoading] = useState(true);

  // Load token and galleryId from sessionStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }

    const currentGalleryId = initialGalleryId || pathname?.match(/^\/(?:login\/)?([^/]+)$/)?.[1] || null;
    
    if (currentGalleryId) {
      setGalleryId(currentGalleryId);
      
      const params = new URLSearchParams(window.location.search);
      const isLoginPreview = params.get("loginPreview") === "1";
      const isOwnerPreview = params.get("ownerPreview") === "1";

      // Owner preview: obtain Cognito token from dashboard via postMessage and store separately.
      // NOTE: This MUST NOT run for loginPreview, as we want to show the login UI.
      if (isOwnerPreview && !isLoginPreview) {
        setAuthMode(currentGalleryId, "owner");
        // If token exists in sessionStorage (single source of truth), we'll validate it below.
        // If not, request it from the opener.
        const existingOwnerToken = getToken(currentGalleryId);
        if (!existingOwnerToken) {
          void (async () => {
            try {
              const idToken = await requestDashboardIdToken({ timeoutMs: 4000 });
              setOwnerToken(currentGalleryId, idToken);
              setTokenState(idToken);
            } catch {
              // If we can't obtain a token, fall back to unauthenticated (gallery page will redirect to login)
            } finally {
              setIsLoading(false);
            }
          })();
          return;
        }
      }

      // Check if token exists in sessionStorage (single source of truth)
      const storedToken = getToken(currentGalleryId);
      if (storedToken) {
        try {
          // Verify token is valid (check if it's a valid JWT format)
          const parts = storedToken.split(".");
          if (parts.length === 3) {
            // Decode payload to check expiration
            const payload = JSON.parse(atob(parts[1]));
            const now = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp > now) {
              // Token is valid and not expired - set state for isAuthenticated
              setTokenState(storedToken);
            } else {
              // Token expired, remove it
              clearToken(currentGalleryId);
            }
          }
        } catch (e) {
          // Invalid token, remove it
          clearToken(currentGalleryId);
        }
      }
    }
    
    setIsLoading(false);
  }, [initialGalleryId, pathname]);

  // Update galleryId when pathname changes
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentGalleryId = initialGalleryId || pathname?.match(/^\/(?:login\/)?([^/]+)$/)?.[1] || null;
    
    if (currentGalleryId && currentGalleryId !== galleryId) {
      setGalleryId(currentGalleryId);
      
      // Check token for the new galleryId
      const storedToken = getToken(currentGalleryId);
      if (storedToken) {
        try {
          const parts = storedToken.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const now = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp > now) {
              setTokenState(storedToken);
            } else {
              clearToken(currentGalleryId);
              setTokenState(null);
            }
          }
        } catch (e) {
          clearToken(currentGalleryId);
          setTokenState(null);
        }
      } else {
        setTokenState(null);
      }
    }
  }, [initialGalleryId, pathname, galleryId]);

  const login = (galleryId: string, token: string) => {
    // Store token in sessionStorage (single source of truth)
    setToken(galleryId, token);
    // Update state for isAuthenticated check
    setTokenState(token);
    setGalleryId(galleryId);
  };

  const logout = () => {
    const currentGalleryId = galleryId || pathname?.match(/^\/(?:login\/)?([^/]+)$/)?.[1] || null;
    
    // Clear token from sessionStorage (single source of truth)
    clearToken(currentGalleryId);
    
    setTokenState(null);
    setGalleryId(null);
    
    if (currentGalleryId) {
      router.push(`/login/${currentGalleryId}`);
    } else {
      router.push("/");
    }
  };

  // isAuthenticated is derived from sessionStorage (single source of truth)
  const isAuthenticated = !!galleryId && !!getToken(galleryId);

  return (
    <AuthContext.Provider
      value={{
        token: tokenState, // Keep for backward compatibility, but hooks should use getToken()
        galleryId,
        isAuthenticated,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
