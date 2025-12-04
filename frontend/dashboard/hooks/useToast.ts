import { useToastStore } from "../store";

/**
 * Hook for managing toast notifications
 * Uses Zustand store for state management
 *
 * @returns Object with showToast, removeToast, clearAllToasts
 */
export const useToast = () => {
  const showToast = useToastStore((state) => state.showToast);
  const removeToast = useToastStore((state) => state.removeToast);
  const clearAllToasts = useToastStore((state) => state.clearAllToasts);

  return {
    showToast,
    removeToast,
    clearAllToasts,
  };
};
