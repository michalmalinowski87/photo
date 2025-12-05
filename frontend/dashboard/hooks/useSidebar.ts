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
  const toggleSidebar = useSidebarStore((state) => state.toggleSidebar);
  const toggleMobileSidebar = useSidebarStore((state) => state.toggleMobileSidebar);

  return {
    isExpanded,
    isMobileOpen,
    toggleSidebar,
    toggleMobileSidebar,
  };
};
