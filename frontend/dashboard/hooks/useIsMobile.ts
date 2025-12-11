import { useEffect, useState } from "react";

/**
 * Hook to detect if the current device is mobile
 * Uses window width < 768px as the mobile breakpoint
 * @returns boolean indicating if device is mobile
 */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") {
      return;
    }

    const checkMobile = () => {
      // Use 768px as mobile breakpoint (standard Tailwind md breakpoint)
      setIsMobile(window.innerWidth < 768);
    };

    // Check on mount
    checkMobile();

    // Listen for resize events
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  return isMobile;
};
