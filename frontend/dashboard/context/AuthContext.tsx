import { useRouter } from "next/router";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

import SessionExpiredModal from "../components/auth/SessionExpiredModal";

interface AuthContextType {
  isSessionExpired: boolean;
  setSessionExpired: (expired: boolean, returnUrl?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [returnUrl, setReturnUrl] = useState<string>("");
  const router = useRouter();

  const setSessionExpired = useCallback((expired: boolean, url?: string) => {
    setIsSessionExpired(expired);
    if (url) {
      setReturnUrl(url);
    }
  }, []);

  // Listen for session-expired events from API interceptor
  useEffect(() => {
    const handleSessionExpired = (event: Event) => {
      const customEvent = event as CustomEvent<{ returnUrl?: string }>;
      const url = customEvent.detail?.returnUrl ?? router.asPath ?? "/galleries";
      setSessionExpired(true, url);
    };

    window.addEventListener("session-expired", handleSessionExpired as EventListener);

    return () => {
      window.removeEventListener("session-expired", handleSessionExpired as EventListener);
    };
  }, [router.asPath, setSessionExpired]);

  return (
    <AuthContext.Provider value={{ isSessionExpired, setSessionExpired }}>
      {children}
      <SessionExpiredModal isOpen={isSessionExpired} returnUrl={returnUrl} />
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
