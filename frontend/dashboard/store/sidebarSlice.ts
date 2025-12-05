import { StateCreator } from "zustand";

export interface SidebarSlice {
  isMobileOpen: boolean;
  isMobile: boolean;
  toggleMobileSidebar: () => void;
  toggleSidebar: () => void;
  // Internal method to update mobile state
  _setIsMobile: (isMobile: boolean) => void;
}

export const createSidebarSlice: StateCreator<
  SidebarSlice,
  [["zustand/devtools", never]],
  [],
  SidebarSlice
> = (set) => ({
  isMobileOpen: false,
  isMobile: false,

  toggleMobileSidebar: () => {
    set(
      (state) => ({
        isMobileOpen: !state.isMobileOpen,
      }),
      undefined,
      "sidebar/toggleMobileSidebar"
    );
  },

  toggleSidebar: () => {
    // No-op, sidebar always expanded on desktop
  },

  _setIsMobile: (isMobile: boolean) => {
    set(
      (state) => ({
        isMobile,
        // Only keep isMobileOpen true if we're on mobile, otherwise close it
        isMobileOpen: isMobile && state.isMobileOpen,
      }),
      undefined,
      "sidebar/_setIsMobile"
    );
  },
});
