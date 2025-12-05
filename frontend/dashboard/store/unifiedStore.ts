import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createAuthSlice, AuthSlice } from "./authSlice";
import { createDownloadSlice, DownloadSlice } from "./downloadSlice";
import { createGallerySlice, GallerySlice } from "./gallerySlice";
import { createModalSlice, ModalSlice } from "./modalSlice";
import { createOrderSlice, OrderSlice } from "./orderSlice";
import { createOverlaySlice, OverlaySlice } from "./overlaySlice";
import { createSidebarSlice, SidebarSlice } from "./sidebarSlice";
import { createThemeSlice, ThemeSlice } from "./themeSlice";
import { createToastSlice, ToastSlice } from "./toastSlice";
import { createUploadSlice, UploadSlice } from "./uploadSlice";
import { createUserSlice, UserSlice } from "./userSlice";
import { createUISlice, UISlice } from "./uiSlice";

// Combined store type
export type UnifiedStore = AuthSlice &
  DownloadSlice &
  GallerySlice &
  ModalSlice &
  OrderSlice &
  OverlaySlice &
  SidebarSlice &
  ThemeSlice &
  ToastSlice &
  UploadSlice &
  UserSlice &
  UISlice;

// Unified store with all slices combined
export const useUnifiedStore = create<UnifiedStore>()(
  devtools(
    persist(
      (...args) => ({
        ...createAuthSlice(...args),
        ...createDownloadSlice(...args),
        ...createGallerySlice(...args),
        ...createModalSlice(...args),
        ...createOrderSlice(...args),
        ...createOverlaySlice(...args),
        ...createSidebarSlice(...args),
        ...createThemeSlice(...args),
        ...createToastSlice(...args),
        ...createUploadSlice(...args),
        ...createUserSlice(...args),
        ...createUISlice(...args),
      }),
      {
        name: "app-storage",
        partialize: (state) => ({
          // Persist user identity
          userId: state.userId,
          email: state.email,
          username: state.username,
          // Persist UI preferences
          tablePreferences: state.tablePreferences,
          // Persist theme
          theme: state.theme,
          // Persist overlay state to prevent flash on navigation
          nextStepsVisible: state.nextStepsVisible,
          nextStepsExpanded: state.nextStepsExpanded,
          nextStepsOverlayExpanded: state.nextStepsOverlayExpanded,
        }),
        onRehydrateStorage: () => (state) => {
          // Initialize theme on rehydration
          if (state && typeof window !== "undefined") {
            const savedTheme = localStorage.getItem("app-storage");
            if (savedTheme) {
              try {
                const parsed = JSON.parse(savedTheme);
                const theme = parsed.state?.theme || "light";
                const nextStepsVisible = parsed.state?.nextStepsVisible;
                const nextStepsExpanded = parsed.state?.nextStepsExpanded;
                const nextStepsOverlayExpanded = parsed.state?.nextStepsOverlayExpanded;

                console.log("[UnifiedStore] Rehydrating state", {
                  theme,
                  nextStepsVisible,
                  nextStepsExpanded,
                  nextStepsOverlayExpanded,
                  fullState: parsed.state,
                });

                state.setTheme(theme);

                // Restore overlay state if it exists
                if (nextStepsVisible !== undefined) {
                  state.setNextStepsVisible(nextStepsVisible);
                }
                if (nextStepsExpanded !== undefined) {
                  state.setNextStepsExpanded(nextStepsExpanded);
                }
                if (nextStepsOverlayExpanded !== undefined) {
                  state.setNextStepsOverlayExpanded(nextStepsOverlayExpanded);
                }
              } catch (err) {
                console.error("[UnifiedStore] Error rehydrating state", err);
                state.setTheme("light");
              }
            } else {
              state.setTheme("light");
            }
          }
        },
      }
    ),
    { name: "AppStore" }
  )
);

// Initialize sidebar mobile state on client side
if (typeof window !== "undefined") {
  const handleResize = () => {
    const mobile = window.innerWidth < 768;
    useUnifiedStore.getState()._setIsMobile(mobile);
  };

  handleResize();
  window.addEventListener("resize", handleResize);
}

// Initialize theme on mount
if (typeof window !== "undefined") {
  const initializeTheme = () => {
    const store = useUnifiedStore.getState();
    if (!store.isInitialized) {
      const savedTheme = localStorage.getItem("app-storage");
      if (savedTheme) {
        try {
          const parsed = JSON.parse(savedTheme);
          const theme = (parsed.state?.theme || "light") as "light" | "dark";
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
