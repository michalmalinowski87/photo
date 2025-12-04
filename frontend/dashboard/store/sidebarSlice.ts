import { StateCreator } from "zustand";

export interface SidebarSlice {
  isMobileOpen: boolean;
  isMobile: boolean;
  activeItem: string | null;
  openSubmenu: string | null;
  isHovered: boolean;
  toggleMobileSidebar: () => void;
  setActiveItem: (item: string | null) => void;
  toggleSubmenu: (item: string) => void;
  setIsHovered: (isHovered: boolean) => void;
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
  activeItem: null,
  openSubmenu: null,
  isHovered: false,

  toggleMobileSidebar: () => {
    set(
      (state) => ({
        isMobileOpen: !state.isMobileOpen,
      }),
      undefined,
      "sidebar/toggleMobileSidebar"
    );
  },

  setActiveItem: (item: string | null) => {
    set({ activeItem: item }, undefined, "sidebar/setActiveItem");
  },

  toggleSubmenu: (item: string) => {
    set(
      (state) => ({
        openSubmenu: state.openSubmenu === item ? null : item,
      }),
      undefined,
      `sidebar/toggleSubmenu/${item}`
    );
  },

  setIsHovered: (_isHovered: boolean) => {
    // No-op, kept for compatibility
  },

  toggleSidebar: () => {
    // No-op, sidebar always expanded on desktop
  },

  _setIsMobile: (isMobile: boolean) => {
    set(
      (state) => ({
        isMobile,
        isMobileOpen: isMobile ? state.isMobileOpen : false,
      }),
      undefined,
      "sidebar/_setIsMobile"
    );
      },
});

