import React, { useEffect, useState, useRef } from "react";
import { FullPageLoading } from "../components/ui/loading/Loading";

/**
 * UX Research on Acceptable Delays:
 * - 100ms: Users feel instant response
 * - 300ms: Users feel responsive
 * - 1000ms: Users notice delay but maintain flow
 * - 3000ms+: Users feel frustrated
 *
 * Frustration point threshold: 300-500ms
 * After this threshold, we show a full-page overlay to indicate the system is working,
 * especially important for slow networks where users might think nothing is happening.
 */

interface UseDelayedLoadingOverlayOptions {
  /**
   * Whether the async operation is currently in progress
   */
  isLoading: boolean;
  /**
   * Delay in milliseconds before showing the overlay (default: 400ms)
   * This is the "frustration point" - after this delay, users start to feel the system is unresponsive
   */
  delay?: number;
  /**
   * Custom message to display in the overlay
   */
  message?: string;
  /**
   * Minimum duration to show overlay (prevents flickering on fast operations)
   * Default: 200ms
   */
  minShowDuration?: number;
}

/**
 * Hook that shows a full-page loading overlay after a delay threshold.
 * This prevents the "stale" feeling on slow networks by providing immediate visual feedback
 * after the frustration point (300-500ms).
 *
 * @example
 * ```tsx
 * const mutation = useSomeMutation();
 * const showOverlay = useDelayedLoadingOverlay({
 *   isLoading: mutation.isPending,
 *   message: "Przetwarzanie..."
 * });
 *
 * return (
 *   <>
 *     {showOverlay && <FullPageLoading text="Przetwarzanie..." />}
 *     <Button onClick={() => mutation.mutate()}>Submit</Button>
 *   </>
 * );
 * ```
 */
export function useDelayedLoadingOverlay({
  isLoading,
  delay = 400,
  message,
  minShowDuration = 200,
}: UseDelayedLoadingOverlayOptions): boolean {
  const [showOverlay, setShowOverlay] = useState(false);
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const minShowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const overlayShownAtRef = useRef<number | null>(null);
  const loadingStartedAtRef = useRef<number | null>(null);
  const wasLoadingRef = useRef<boolean>(false);

  useEffect(() => {
    // Track previous loading state
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoading;

    if (isLoading) {
      // Track when loading started
      if (!loadingStartedAtRef.current) {
        loadingStartedAtRef.current = Date.now();
      }

      // Start delay timer - show overlay after frustration point
      // Always set timer when loading starts (reset if already set to track full duration)
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
      }
      
      delayTimeoutRef.current = setTimeout(() => {
        // Check loading duration at the time the delay elapses
        const loadingDuration = loadingStartedAtRef.current
          ? Date.now() - loadingStartedAtRef.current
          : delay;
        
        // Show overlay - the delay has elapsed, so user has waited long enough
        setShowOverlay(true);
        overlayShownAtRef.current = Date.now();
        delayTimeoutRef.current = null;
      }, delay);
    } else {
      // Loading finished
      const loadingDuration = loadingStartedAtRef.current
        ? Date.now() - loadingStartedAtRef.current
        : 0;
      
      // If loading took longer than delay, overlay should be shown (or about to show)
      if (loadingDuration >= delay || showOverlay) {
        // Hide overlay with minimum show duration
        if (showOverlay) {
          const overlayShownAt = overlayShownAtRef.current ?? Date.now();
          const timeShown = Date.now() - overlayShownAt;

          // If overlay was shown for less than minShowDuration, wait before hiding
          // This prevents flickering on fast operations
          if (timeShown < minShowDuration) {
            const remainingTime = minShowDuration - timeShown;
            minShowTimeoutRef.current = setTimeout(() => {
              setShowOverlay(false);
              overlayShownAtRef.current = null;
              loadingStartedAtRef.current = null;
            }, remainingTime);
          } else {
            // Hide immediately if shown long enough
            setShowOverlay(false);
            overlayShownAtRef.current = null;
            loadingStartedAtRef.current = null;
          }
        } else {
          // Loading finished but overlay hasn't shown yet
          // If loading took longer than delay, show overlay immediately
          if (loadingDuration >= delay) {
            // Show overlay immediately since we've exceeded the delay threshold
            // Clear any pending timeout
            if (delayTimeoutRef.current) {
              clearTimeout(delayTimeoutRef.current);
              delayTimeoutRef.current = null;
            }
            // Show overlay and set it to hide after minShowDuration
            setShowOverlay(true);
            overlayShownAtRef.current = Date.now();
            minShowTimeoutRef.current = setTimeout(() => {
              setShowOverlay(false);
              overlayShownAtRef.current = null;
              loadingStartedAtRef.current = null;
            }, minShowDuration);
          } else {
            // Loading finished quickly (< delay) - clear timer
            if (delayTimeoutRef.current) {
              clearTimeout(delayTimeoutRef.current);
              delayTimeoutRef.current = null;
            }
            loadingStartedAtRef.current = null;
          }
        }
      } else {
        // Loading finished quickly (< delay) - clear timer
        // Don't show overlay for fast operations
        if (delayTimeoutRef.current) {
          clearTimeout(delayTimeoutRef.current);
          delayTimeoutRef.current = null;
        }
        loadingStartedAtRef.current = null;
      }
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = null;
      }
      if (minShowTimeoutRef.current) {
        clearTimeout(minShowTimeoutRef.current);
        minShowTimeoutRef.current = null;
      }
    };
  }, [isLoading, delay, minShowDuration, showOverlay]);

  return showOverlay;
}

/**
 * Component wrapper that automatically shows a full-page loading overlay
 * after the frustration point threshold.
 *
 * @example
 * ```tsx
 * const mutation = useSomeMutation();
 *
 * return (
 *   <>
 *     <DelayedLoadingOverlay isLoading={mutation.isPending} message="Przetwarzanie..." />
 *     <Button onClick={() => mutation.mutate()}>Submit</Button>
 *   </>
 * );
 * ```
 */
export function DelayedLoadingOverlay({
  isLoading,
  delay = 400,
  message,
  minShowDuration = 200,
}: UseDelayedLoadingOverlayOptions): JSX.Element | null {
  const showOverlay = useDelayedLoadingOverlay({
    isLoading,
    delay,
    message,
    minShowDuration,
  });

  if (!showOverlay) {
    return null;
  }

  return <FullPageLoading text={message} />;
}

