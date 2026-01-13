"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

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
  const [token, setToken] = useState<string | null>(null);
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
      
      // Load token from sessionStorage
      const storedToken = sessionStorage.getItem(`gallery_token_${currentGalleryId}`);
      if (storedToken) {
        try {
          // Verify token is valid (check if it's a valid JWT format)
          const parts = storedToken.split(".");
          if (parts.length === 3) {
            // Decode payload to check expiration
            const payload = JSON.parse(atob(parts[1]));
            const now = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp > now) {
              // Token is valid and not expired
              setToken(storedToken);
            } else {
              // Token expired, remove it
              sessionStorage.removeItem(`gallery_token_${currentGalleryId}`);
            }
          }
        } catch (e) {
          // Invalid token, remove it
          sessionStorage.removeItem(`gallery_token_${currentGalleryId}`);
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
      
      // Load token for the new galleryId
      const storedToken = sessionStorage.getItem(`gallery_token_${currentGalleryId}`);
      if (storedToken) {
        try {
          const parts = storedToken.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const now = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp > now) {
              setToken(storedToken);
            } else {
              sessionStorage.removeItem(`gallery_token_${currentGalleryId}`);
              setToken(null);
            }
          }
        } catch (e) {
          sessionStorage.removeItem(`gallery_token_${currentGalleryId}`);
          setToken(null);
        }
      } else {
        setToken(null);
      }
    }
  }, [initialGalleryId, pathname, galleryId]);

  const login = (galleryId: string, token: string) => {
    // Store token in sessionStorage FIRST (synchronous)
    if (typeof window !== "undefined") {
      sessionStorage.setItem(`gallery_token_${galleryId}`, token);
    }
    
    // Then update state (this triggers re-render)
    setToken(token);
    setGalleryId(galleryId);
  };

  const logout = () => {
    const currentGalleryId = galleryId || pathname?.match(/^\/(?:login\/)?([^/]+)$/)?.[1] || null;
    
    // Clear token and gallery name from sessionStorage
    if (typeof window !== "undefined" && currentGalleryId) {
      sessionStorage.removeItem(`gallery_token_${currentGalleryId}`);
      sessionStorage.removeItem(`gallery_name_${currentGalleryId}`);
    }
    
    setToken(null);
    setGalleryId(null);
    
    if (currentGalleryId) {
      router.push(`/login/${currentGalleryId}`);
    } else {
      router.push("/");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        galleryId,
        isAuthenticated: !!token && !!galleryId,
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
