"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

interface AuthContextType {
  token: string | null;
  galleryId: string | null;
  galleryName: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (galleryId: string, token: string, galleryName?: string) => void;
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
  const [galleryName, setGalleryName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }

    // Use provided gallery ID or extract from pathname (e.g., /gallery/abc123 or /login/abc123)
    const currentGalleryId = initialGalleryId || pathname?.match(/\/(?:gallery|login)\/([^/]+)/)?.[1] || null;

    if (!currentGalleryId) {
      setIsLoading(false);
      return;
    }

    // Load token from localStorage
    const storedToken = localStorage.getItem(`gallery_token_${currentGalleryId}`);
    const storedName = localStorage.getItem(`gallery_name_${currentGalleryId}`);

    if (storedToken) {
      try {
        // Decode token to verify it's valid
        const payload = JSON.parse(atob(storedToken.split(".")[1]));
        setToken(storedToken);
        setGalleryId(currentGalleryId);
        if (storedName) {
          setGalleryName(storedName);
        }
      } catch (e) {
        // Invalid token, remove it
        localStorage.removeItem(`gallery_token_${currentGalleryId}`);
        localStorage.removeItem(`gallery_name_${currentGalleryId}`);
      }
    }

    setIsLoading(false);
  }, [initialGalleryId, pathname]);

  const login = (galleryId: string, token: string, galleryName?: string) => {
    setToken(token);
    setGalleryId(galleryId);
    if (galleryName) {
      setGalleryName(galleryName);
      localStorage.setItem(`gallery_name_${galleryId}`, galleryName);
    }
    localStorage.setItem(`gallery_token_${galleryId}`, token);
  };

  const logout = () => {
    const currentGalleryId = galleryId;
    if (currentGalleryId) {
      localStorage.removeItem(`gallery_token_${currentGalleryId}`);
      localStorage.removeItem(`gallery_name_${currentGalleryId}`);
    }
    setToken(null);
    setGalleryId(null);
    setGalleryName(null);
    router.push(`/gallery/login/${currentGalleryId || ""}`);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        galleryId,
        galleryName,
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
