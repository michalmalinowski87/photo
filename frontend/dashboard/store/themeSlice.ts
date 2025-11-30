import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  isInitialized: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  devtools(
    persist(
      (set) => ({
        theme: "light",
        isInitialized: false,

        toggleTheme: () => {
          set((state) => {
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
          });
        },

        setTheme: (theme: Theme) => {
          set({ theme, isInitialized: true });
          // Update DOM immediately
          if (typeof window !== "undefined") {
            if (theme === "dark") {
              document.documentElement.classList.add("dark");
            } else {
              document.documentElement.classList.remove("dark");
            }
          }
        },
      }),
      {
        name: "theme-storage",
        partialize: (state) => ({
          theme: state.theme,
        }),
        onRehydrateStorage: () => (state) => {
          // Initialize theme on rehydration
          if (state && typeof window !== "undefined") {
            const savedTheme = localStorage.getItem("theme-storage");
            if (savedTheme) {
              try {
                const parsed = JSON.parse(savedTheme);
                const theme = parsed.state?.theme || "light";
                state.setTheme(theme);
              } catch {
                state.setTheme("light");
              }
            } else {
              state.setTheme("light");
            }
          }
        },
      }
    ),
    { name: "ThemeStore" }
  )
);

// Initialize theme on mount
if (typeof window !== "undefined") {
  const initializeTheme = () => {
    const store = useThemeStore.getState();
    if (!store.isInitialized) {
      const savedTheme = localStorage.getItem("theme-storage");
      if (savedTheme) {
        try {
          const parsed = JSON.parse(savedTheme);
          const theme = (parsed.state?.theme || "light") as Theme;
          store.setTheme(theme);
        } catch {
          store.setTheme("light");
        }
      } else {
        store.setTheme("light");
      }
    }
  };

  // Run on next tick to ensure store is ready
  setTimeout(initializeTheme, 0);
}
