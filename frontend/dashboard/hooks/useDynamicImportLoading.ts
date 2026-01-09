import { useEffect, useState, useRef, useCallback } from "react";
import type { ComponentType } from "react";

/**
 * Hook to track when dynamically imported components are loading.
 * This helps detect when JavaScript bundles are being downloaded and parsed,
 * which can take time on slow networks.
 *
 * The hook tracks loading state by monitoring when components are first accessed
 * and when they become available. This works with Next.js dynamic() imports.
 *
 * @example
 * ```tsx
 * const MyComponent = dynamic(() => import('./MyComponent'));
 * const { isBundleLoading, trackComponent } = useDynamicImportLoading();
 *
 * useEffect(() => {
 *   trackComponent(MyComponent);
 * }, [MyComponent]);
 *
 * return (
 *   <>
 *     {isBundleLoading && <Loading />}
 *     <MyComponent />
 *   </>
 * );
 * ```
 */
export function useDynamicImportLoading() {
  const [isLoading, setIsLoading] = useState(false);
  const loadingComponentsRef = useRef<Set<ComponentType<any>>>(new Set());
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const trackComponent = useCallback((Component: ComponentType<any> | undefined | null) => {
    if (!Component) {
      return;
    }

    // If component is already tracked, skip
    if (loadingComponentsRef.current.has(Component)) {
      return;
    }

    // Check if component is loaded (is a function, not undefined/null)
    // Dynamic imports that are still loading might be undefined initially
    // Once loaded, they become component functions
    if (typeof Component === "function") {
      // Component is loaded, mark it as tracked but not loading
      loadingComponentsRef.current.add(Component);
      return;
    }

    // Component is not yet loaded, track it
    loadingComponentsRef.current.add(Component);
    setIsLoading(true);

    // Periodically check if component has loaded
    const checkLoaded = () => {
      // If component is now a function, it's loaded
      if (typeof Component === "function") {
        setIsLoading(false);
        loadingComponentsRef.current.delete(Component);
        return;
      }

      // Continue checking (with a timeout to prevent infinite checking)
      checkTimeoutRef.current = setTimeout(checkLoaded, 100);
    };

    checkLoaded();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
      loadingComponentsRef.current.clear();
    };
  }, []);

  return { isBundleLoading: isLoading, trackComponent };
}

/**
 * Hook to track multiple dynamically imported components.
 * Returns true if any component bundle is still loading.
 *
 * @example
 * ```tsx
 * const Component1 = dynamic(() => import('./Component1'));
 * const Component2 = dynamic(() => import('./Component2'));
 * const isAnyLoading = useMultipleDynamicImportLoading([Component1, Component2]);
 * ```
 */
export function useMultipleDynamicImportLoading(
  components: Array<ComponentType<any> | undefined | null>
): boolean {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if any component is still loading (undefined or not a function yet)
    const anyLoading = components.some((Component) => {
      return Component === undefined || Component === null || typeof Component !== "function";
    });

    setIsLoading(anyLoading);
  }, [components]);

  return isLoading;
}
