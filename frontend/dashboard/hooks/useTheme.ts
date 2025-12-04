import { useThemeStore } from "../store";

/**
 * Hook for managing theme state
 * Uses Zustand store for state management
 *
 * @returns Object with theme and toggleTheme
 */
export const useTheme = () => {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return {
    theme,
    toggleTheme,
  };
};
