import dynamic, { type DynamicOptions } from "next/dynamic";
import { useState, useEffect } from "react";

/**
 * Global state to track all dynamic imports that are currently loading.
 * This allows us to detect when JavaScript bundles are being downloaded.
 */
const loadingBundles = new Set<string>();
const loadingListeners = new Set<(isLoading: boolean) => void>();
let navigationLoadingState = false;
let navigationStartTime: number | null = null;

/**
 * Set navigation loading state (used when navigating to routes with dynamic imports)
 */
export function setNavigationLoadingState(loading: boolean) {
  navigationLoadingState = loading;
  if (loading) {
    navigationStartTime = Date.now();
  } else {
    navigationStartTime = null;
  }
  notifyListeners();
}

/**
 * Get navigation start time (to track how long navigation has been in progress)
 */
export function getNavigationStartTime(): number | null {
  return navigationStartTime;
}

/**
 * Notify all listeners that bundle loading state has changed.
 */
function notifyListeners() {
  const isLoading = loadingBundles.size > 0 || navigationLoadingState;
  loadingListeners.forEach((listener) => listener(isLoading));
}

/**
 * Hook to track when any dynamic import bundle is loading.
 * Returns true if any bundle is currently being downloaded/parsed.
 *
 * @example
 * ```tsx
 * const isBundleLoading = useBundleLoading();
 * return (
 *   <>
 *     {isBundleLoading && <Loading />}
 *     <MyLazyComponent />
 *   </>
 * );
 * ```
 */
export function useBundleLoading(): boolean {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const listener = (loading: boolean) => {
      setIsLoading(loading);
    };

    loadingListeners.add(listener);
    // Set initial state
    setIsLoading(loadingBundles.size > 0);

    return () => {
      loadingListeners.delete(listener);
    };
  }, []);

  return isLoading;
}

/**
 * Creates a loading component that tracks bundle loading state.
 * This component is rendered by Next.js dynamic() while the bundle is loading.
 */
function createLoadingTracker(
  bundleId: string,
  originalLoading?: React.ComponentType | ((props: { isLoading?: boolean }) => React.ReactNode)
): (props: { isLoading?: boolean }) => React.ReactNode {
  const LoadingTracker = (props: { isLoading?: boolean }) => {
    useEffect(() => {
      // Loading component is rendered = bundle is loading
      loadingBundles.add(bundleId);
      notifyListeners();
      
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.warn("[BundleLoading] Bundle loading started:", bundleId);
      }

      return () => {
        // Loading component unmounted = bundle finished loading
        // Use a delay to ensure component is actually mounted before removing
        setTimeout(() => {
          loadingBundles.delete(bundleId);
          notifyListeners();
          if (process.env.NODE_ENV === "development") {
            // eslint-disable-next-line no-console
            console.warn("[BundleLoading] Bundle loading finished:", bundleId);
          }
        }, 100);
      };
    }, []);

    // Use the original loading component if provided, otherwise return null
    if (originalLoading) {
      // If it's a component type, render it
      const LoadingComponent = originalLoading as React.ComponentType<{ isLoading?: boolean }>;
      return <LoadingComponent {...props} />;
    }

    return null;
  };
  LoadingTracker.displayName = `LoadingTracker(${bundleId})`;
  return LoadingTracker;
}

/**
 * Enhanced dynamic import that tracks bundle loading state.
 * Works exactly like Next.js dynamic(), but also tracks when bundles are loading
 * so we can show delayed loading overlays.
 *
 * The tracking works by using the `loading` prop callback to detect when
 * bundles start and stop loading.
 *
 * @example
 * ```tsx
 * const MyComponent = dynamicWithLoading(() => import('./MyComponent'), {
 *   ssr: false,
 * });
 * ```
 */
export function dynamicWithLoading<P = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loader: () => Promise<any>,
  options?: DynamicOptions<P>
): React.ComponentType<P> {
  const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Create loading tracker component
  const loadingTracker = createLoadingTracker(
    bundleId,
    options?.loading as React.ComponentType | ((props: { isLoading?: boolean }) => React.ReactNode) | undefined
  );

  // Create the dynamic component with our loading tracker
  // Next.js dynamic() handles the types internally
  return dynamic(loader, {
    ...options,
    loading: loadingTracker,
  });
}
