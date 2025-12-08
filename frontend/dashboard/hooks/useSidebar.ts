import { useEffect, useState } from "react";

import { useSidebarStore } from "../store";

/**
 * Hook for managing sidebar state
 * Uses Zustand store for state management
 *
 * @returns Sidebar state and actions
 */
export const useSidebar = () => {
  const isMobileOpen = useSidebarStore((state) => state.isMobileOpen);
  const toggleSidebar = useSidebarStore((state) => state.toggleSidebar);
  const toggleMobileSidebar = useSidebarStore((state) => state.toggleMobileSidebar);

  // isExpanded should be true when viewport >= 1024px (lg breakpoint) to match CSS
  // This is independent of isMobile which uses 1350px breakpoint
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const checkExpanded = () => {
      // Match Tailwind's lg breakpoint (1024px)
      setIsExpanded(window.innerWidth >= 1024);
    };

    checkExpanded();
    window.addEventListener("resize", checkExpanded);
    return () => window.removeEventListener("resize", checkExpanded);
  }, []);

  return {
    isExpanded,
    isMobileOpen,
    toggleSidebar,
    toggleMobileSidebar,
  };
};
