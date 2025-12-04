import { useSidebarStore } from "../store";

/**
 * Hook for managing sidebar state
 * Uses Zustand store for state management
 *
 * @returns Sidebar state and actions
 */
export const useSidebar = () => {
  const isMobile = useSidebarStore((state) => state.isMobile);
  const isExpanded = !isMobile; // Always expanded on desktop, only mobile can toggle
  const isMobileOpen = useSidebarStore((state) => state.isMobileOpen);
  const isHovered = useSidebarStore((state) => state.isHovered);
  const activeItem = useSidebarStore((state) => state.activeItem);
  const openSubmenu = useSidebarStore((state) => state.openSubmenu);
  const toggleSidebar = useSidebarStore((state) => state.toggleSidebar);
  const toggleMobileSidebar = useSidebarStore((state) => state.toggleMobileSidebar);
  const setIsHovered = useSidebarStore((state) => state.setIsHovered);
  const setActiveItem = useSidebarStore((state) => state.setActiveItem);
  const toggleSubmenu = useSidebarStore((state) => state.toggleSubmenu);

  return {
    isExpanded,
    isMobileOpen,
    isHovered,
    activeItem,
    openSubmenu,
    toggleSidebar,
    toggleMobileSidebar,
    setIsHovered,
    setActiveItem,
    toggleSubmenu,
  };
};
