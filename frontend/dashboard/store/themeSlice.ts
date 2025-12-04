import { StateCreator } from "zustand";

export type Theme = "light" | "dark";

export interface ThemeSlice {
  theme: Theme;
  isInitialized: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const createThemeSlice: StateCreator<
  ThemeSlice,
  [["zustand/devtools", never]],
  [],
  ThemeSlice
> = (set) => ({
  theme: "light",
  isInitialized: false,

  toggleTheme: () => {
    set(
      (state) => {
        const newTheme = state.theme === "light" ? "dark" : "light";
        // Update DOM immediately
        if (typeof window !== "undefined") {
          if (newTheme === "dark") {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
        }
        return { theme: newTheme };
      },
      undefined,
      "theme/toggleTheme"
    );
  },

  setTheme: (theme: Theme) => {
    set({ theme, isInitialized: true }, undefined, `theme/setTheme/${theme}`);
    // Update DOM immediately
    if (typeof window !== "undefined") {
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  },
});

