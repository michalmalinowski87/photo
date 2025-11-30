import { useAuthStore } from "../store/authSlice";

/**
 * Hook for managing authentication state
 * Uses Zustand store for state management
 *
 * @returns Object with isSessionExpired and setSessionExpired
 */
export const useAuth = () => {
  const isSessionExpired = useAuthStore((state) => state.isSessionExpired);
  const returnUrl = useAuthStore((state) => state.returnUrl);
  const setSessionExpired = useAuthStore((state) => state.setSessionExpired);

  return {
    isSessionExpired,
    returnUrl,
    setSessionExpired,
  };
};

