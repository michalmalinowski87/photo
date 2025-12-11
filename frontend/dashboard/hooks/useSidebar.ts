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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

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

  // Only use isExpanded after mount to prevent hydration mismatch
  // On server and initial render, use false to ensure consistent rendering
  // After mount, the actual viewport width determines the value
  const effectiveIsExpanded = isMounted ? isExpanded : false;

  return {
    isExpanded: effectiveIsExpanded,
    isMobileOpen,
    toggleSidebar,
    toggleMobileSidebar,
  };
};
