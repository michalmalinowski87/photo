import { useRouter } from "next/router";
import { useEffect } from "react";

import { useAuth } from "../../context/AuthProvider";

import SessionExpiredModal from "./SessionExpiredModal";

/**
 * SessionExpiredModalWrapper component that uses AuthProvider context
 */
export const SessionExpiredModalWrapper: React.FC = () => {
  const router = useRouter();
  const { isSessionExpired, returnUrl, setSessionExpired } = useAuth();

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

  return <SessionExpiredModal isOpen={isSessionExpired} returnUrl={returnUrl} />;
};
