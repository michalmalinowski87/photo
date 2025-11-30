import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface SidebarState {
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

export const useSidebarStore = create<SidebarState>()(
  devtools(
    (set) => ({
      isMobileOpen: false,
      isMobile: false,
      activeItem: null,
      openSubmenu: null,
      isHovered: false,

      toggleMobileSidebar: () => {
        set((state) => ({
          isMobileOpen: !state.isMobileOpen,
        }));
      },

      setActiveItem: (item: string | null) => {
        set({ activeItem: item });
      },

      toggleSubmenu: (item: string) => {
        set((state) => ({
          openSubmenu: state.openSubmenu === item ? null : item,
        }));
      },

      setIsHovered: (_isHovered: boolean) => {
        // No-op, kept for compatibility
      },

      toggleSidebar: () => {
        // No-op, sidebar always expanded on desktop
      },

      _setIsMobile: (isMobile: boolean) => {
        set((state) => ({
          isMobile,
          isMobileOpen: isMobile ? state.isMobileOpen : false,
        }));
      },
    }),
    { name: "SidebarStore" }
  )
);

// Initialize mobile state on client side
if (typeof window !== "undefined") {
  const handleResize = () => {
    const mobile = window.innerWidth < 768;
    useSidebarStore.getState()._setIsMobile(mobile);
  };

  handleResize();
  window.addEventListener("resize", handleResize);
}

